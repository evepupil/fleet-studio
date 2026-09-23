import { readFile } from "node:fs/promises";
import {
  expandRolePaths,
  findPool,
  findRole,
  getRuntimeAdapter,
  opencodePromptPath,
  type RoleConfig,
  type RunRecord,
  type WorkerRecord,
} from "@fleet/core";
import { createOutputTailer } from "../process/outputTailer.js";
import { finishRun } from "./finisher.js";
import { createRunTracker } from "./runTracker.js";
import type { EngineContext } from "./types.js";

/** 配置里找不到角色时用的兜底空角色：只留编号，不附加任何提示词或工具限制。 */
function emptyRole(roleId: string): RoleConfig {
  return { id: roleId, label: roleId, description: "", pi: {}, opencode: {} };
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * 把一次已经占住槽位（状态已经是 running）的运行真正拉起来（模块设计 3.5）。
 * 任何一步出错都让这次运行失败 spawn_error，绝不让异常冒出去影响放行循环。
 * `run` 必须是 dispatcher 占位之后的最新状态（status 已经是 running）。
 */
export async function launchRun(
  ctx: EngineContext,
  run: RunRecord,
  worker: WorkerRecord,
): Promise<void> {
  try {
    const config = ctx.deps.config.current();
    const pool = findPool(config, worker.poolId);
    if (pool === null) {
      await failSpawn(ctx, run, worker, `所在的池 ${worker.poolId} 已从配置中删除`);
      return;
    }

    const roleConfig = findRole(config, worker.role);
    if (roleConfig === null) {
      ctx.deps.logger.warn(`角色 ${worker.role} 已从配置中删除，苦工 ${worker.id} 使用空角色继续`);
    }
    const role = expandRolePaths(roleConfig ?? emptyRole(worker.role), {
      home: ctx.deps.homeDir,
      builtinRoot: ctx.deps.builtinRoot,
    });

    let rolePromptText: string | null = null;
    if (worker.runtime === "opencode") {
      const promptPath = opencodePromptPath(role);
      if (promptPath !== null) {
        try {
          rolePromptText = await readFile(promptPath, "utf8");
        } catch {
          await failSpawn(ctx, run, worker, `读不到角色提示词：${promptPath}`);
          return;
        }
      }
    }

    const adapter = getRuntimeAdapter(worker.runtime);
    const runDir = ctx.deps.paths.runDir(run.id);
    const launchSpec = adapter.buildLaunch({
      prompt: run.prompt,
      runDir,
      cwd: worker.cwd,
      title: worker.title,
      sessionRef: worker.sessionRef,
      isContinuation: run.seq > 1,
      thinking: worker.thinking,
      pool,
      role,
      rolePromptText,
    });

    const command = await ctx.deps.host.resolve(worker.runtime);
    const env = await ctx.deps.host.workerEnv();
    const outFile = ctx.deps.paths.outFile(run.id);
    const errFile = ctx.deps.paths.errFile(run.id);
    const spawned = await ctx.deps.host.spawn({
      command,
      args: launchSpec.args,
      cwd: worker.cwd,
      env,
      stdoutPath: outFile,
      stderrPath: errFile,
      files: launchSpec.files,
    });

    ctx.deps.repos.runs.update(run.id, { pid: spawned.pid, processImage: spawned.image });
    ctx.notifyWorker(worker.id);

    // 启动期间被取消：cancel() 已经写了 killedBy=cancel，但那时候还拿不到进程号，
    // 只能等这里拿到进程号之后自己发现并立刻结束它（模块设计 3.5 第 7 步）。
    const afterSpawn = ctx.deps.repos.runs.get(run.id);
    if (afterSpawn !== null && afterSpawn.killedBy === "cancel") {
      try {
        await ctx.deps.host.kill(spawned.pid);
      } catch (error) {
        ctx.deps.logger.error(`运行 ${run.id} 启动期间被取消，结束进程失败`, error);
      }
    }

    const tracker = createRunTracker(ctx, {
      runId: run.id,
      workerId: worker.id,
      pid: spawned.pid,
      processImage: spawned.image,
      reducer: adapter.createReducer(),
      stdoutTailer: createOutputTailer(outFile, 0),
      stderrTailer: createOutputTailer(errFile, 0),
      isAdopted: false,
      sessionRefKnown: worker.sessionRef !== null,
    });
    ctx.trackers.set(run.id, tracker);
    spawned.onExit((exit) => {
      void tracker.handleExit(exit).finally(() => {
        ctx.trackers.delete(run.id);
      });
    });
  } catch (error) {
    await failSpawn(ctx, run, worker, errorMessageOf(error));
  }
}

async function failSpawn(
  ctx: EngineContext,
  run: RunRecord,
  worker: WorkerRecord,
  message: string,
): Promise<void> {
  try {
    await finishRun(ctx, {
      run,
      worker,
      outcome: { status: "failed", failReason: "spawn_error", message },
      exitCode: run.exitCode,
      usage: run.usage,
      activity: run.activity,
      finalText: run.finalText,
      eventCount: run.eventCount,
    });
  } catch (error) {
    ctx.deps.logger.error(`运行 ${run.id} 启动失败后收尾也失败了`, error);
  }
}
