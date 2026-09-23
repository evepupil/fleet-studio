import { readFile } from "node:fs/promises";
import {
  expandRolePaths,
  findPool,
  findRole,
  getRuntimeAdapter,
  opencodePromptPath,
  type RoleConfig,
  type RunRecord,
  type RuntimeAdapter,
  type WorkerRecord,
} from "@fleet/core";
import { createOutputTailer } from "../process/outputTailer.js";
import type { SpawnedProcess } from "../process/types.js";
import { finishRun } from "./finisher.js";
import { createRunTracker } from "./runTracker.js";
import type { EngineContext } from "./types.js";

/**
 * 评审 F5：占位成工作中之后，到拿到进程号之间（resolve、读角色提示词、spawn）如果挂住，
 * 不能让这个名额永远占着——超过这个时长就主动收尾，绝不无限等待。
 */
const LAUNCH_TIMEOUT_MS = 60_000;

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

interface PreparedLaunch {
  spawned: SpawnedProcess;
  adapter: RuntimeAdapter;
}

type PrepareResult =
  | { kind: "prepared"; prepared: PreparedLaunch }
  | { kind: "failed"; error: unknown };

/**
 * 把一次已经占住槽位（状态已经是 running）的运行真正拉起来（模块设计 3.5）。
 * 任何一步出错都让这次运行失败 spawn_error，绝不让异常冒出去影响放行循环。
 * `run` 必须是 dispatcher 占位之后的最新状态（status 已经是 running）。
 *
 * 评审 F5：拿到进程号之前的整段准备工作和一个 60 秒的定时器赛跑——定时器先到就先收尾，
 * 但准备工作本身不会被真的取消，之后如果它才迟迟给出结果，用剩下的回调把孤儿进程杀掉。
 */
export async function launchRun(
  ctx: EngineContext,
  run: RunRecord,
  worker: WorkerRecord,
): Promise<void> {
  const preparePromise = prepareAndSpawn(ctx, run, worker);

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timedOutPromise = new Promise<{ kind: "timedOut" }>((resolve) => {
    timeoutHandle = setTimeout(() => resolve({ kind: "timedOut" }), LAUNCH_TIMEOUT_MS);
  });
  const preparedOrFailed: Promise<PrepareResult> = preparePromise.then(
    (prepared) => ({ kind: "prepared", prepared }),
    (error: unknown) => ({ kind: "failed", error }),
  );

  const settled = await Promise.race([preparedOrFailed, timedOutPromise]);
  clearTimeout(timeoutHandle);

  if (settled.kind === "timedOut") {
    await handleLaunchTimeout(ctx, run, worker);
    // 准备工作没有真的被取消，之后可能还会给出结果：迟到的启动成功要立刻杀掉，
    // 避免这个运行已经判定失败/取消之后，还留着一个没人跟踪的孤儿进程。
    void preparePromise.then(
      async (prepared) => {
        try {
          await ctx.deps.host.kill(prepared.spawned.pid);
        } catch (error) {
          ctx.deps.logger.error(`运行 ${run.id} 启动超时后又迟到启动成功，结束进程失败`, error);
        }
      },
      () => {
        // 迟到的失败结果不用再处理，已经按超时收尾过了。
      },
    );
    return;
  }
  if (settled.kind === "failed") {
    await failSpawn(ctx, run, worker, errorMessageOf(settled.error));
    return;
  }
  await finishLaunchSuccess(ctx, run, worker, settled.prepared);
}

/** 拿可执行文件、拼参数、真正 spawn；任何一步失败都直接抛错，交给调用方统一处理。 */
async function prepareAndSpawn(
  ctx: EngineContext,
  run: RunRecord,
  worker: WorkerRecord,
): Promise<PreparedLaunch> {
  const config = ctx.deps.config.current();
  const pool = findPool(config, worker.poolId);
  if (pool === null) {
    throw new Error(`所在的池 ${worker.poolId} 已从配置中删除`);
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
        throw new Error(`读不到角色提示词：${promptPath}`);
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
  const spawned = await ctx.deps.host.spawn({
    command,
    args: launchSpec.args,
    cwd: worker.cwd,
    env,
    stdoutPath: ctx.deps.paths.outFile(run.id),
    stderrPath: ctx.deps.paths.errFile(run.id),
    files: launchSpec.files,
  });
  return { spawned, adapter };
}

/** 拿到进程号之后：写库、检查有没有在启动期间被取消、建跟踪器、挂 onExit。 */
async function finishLaunchSuccess(
  ctx: EngineContext,
  run: RunRecord,
  worker: WorkerRecord,
  prepared: PreparedLaunch,
): Promise<void> {
  const { spawned, adapter } = prepared;
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

  const outFile = ctx.deps.paths.outFile(run.id);
  const errFile = ctx.deps.paths.errFile(run.id);
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
}

/**
 * 评审 F5：拿进程号超过 60 秒还没结果。这次运行从没真正启动过（没有 pid），
 * 按取消或超时哪个先发生来判定：cancel() 抢先写过 killedBy 就收尾为已取消，否则算启动超时。
 */
async function handleLaunchTimeout(
  ctx: EngineContext,
  run: RunRecord,
  worker: WorkerRecord,
): Promise<void> {
  const current = ctx.deps.repos.runs.get(run.id);
  const killedBy = current?.killedBy ?? null;
  if (killedBy === "cancel") {
    try {
      await finishRun(ctx, {
        run,
        worker,
        outcome: { status: "cancelled", failReason: null, message: "已被取消" },
        exitCode: run.exitCode,
        usage: run.usage,
        activity: run.activity,
        finalText: run.finalText,
        eventCount: run.eventCount,
        expectedStatus: "running",
      });
    } catch (error) {
      ctx.deps.logger.error(`运行 ${run.id} 启动超时（取消）后收尾失败`, error);
    }
    return;
  }
  await failSpawn(ctx, run, worker, `启动超时（${LAUNCH_TIMEOUT_MS / 1000} 秒）`);
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
      expectedStatus: "running",
    });
  } catch (error) {
    ctx.deps.logger.error(`运行 ${run.id} 启动失败后收尾也失败了`, error);
  }
}
