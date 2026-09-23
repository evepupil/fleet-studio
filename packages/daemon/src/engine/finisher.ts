import { assertTransition, resolveRunOutcome } from "@fleet/core";
import type { RunPatch } from "../store/types.js";
import type { EngineContext, FinishInput, ResolveAndFinishInput } from "./types.js";

/**
 * 收尾：结局已经判定好，这里只管一次性写库、刷新时间线、通知、请求放行（模块设计 3.7）。
 * assertTransition 出错会直接向上抛，调用方（runTracker/timeouts/recovery/dispatcher/cancel）
 * 各自包 try/catch，一个运行的收尾出错不能连累其它运行。
 */
export async function finishRun(ctx: EngineContext, input: FinishInput): Promise<void> {
  const { run, worker, outcome } = input;
  assertTransition(run.status, outcome.status);

  const patch: RunPatch = {
    status: outcome.status,
    failReason: outcome.failReason,
    errorMessage: outcome.message,
    endedAt: new Date(ctx.now()).toISOString(),
    exitCode: input.exitCode,
    usage: input.usage,
    retry: null,
    activity: input.activity,
    finalText: input.finalText,
    eventCount: input.eventCount,
  };
  ctx.deps.repos.runs.update(run.id, patch);

  await ctx.timelines.refresh(worker.id);
  ctx.notifyWorker(worker.id);
  ctx.requestDispatch();
}

/**
 * 有事件流进展和进程退出信息时的收尾入口：先用 resolveRunOutcome 判定结局再写库。
 * 调用方必须传入「刚从库里取出的」run（尤其是 killedBy 字段）——取消/超时是另外的代码路径
 * 异步写进去的，这里不能用一份可能已经过期的内存快照去判定结局。
 */
export async function resolveAndFinishRun(
  ctx: EngineContext,
  input: ResolveAndFinishInput,
): Promise<void> {
  const { run, worker, progress, exit } = input;
  const outcome = resolveRunOutcome({
    progress,
    exit,
    killedBy: run.killedBy,
    timeoutMs: run.timeoutMs,
  });
  await finishRun(ctx, {
    run,
    worker,
    outcome,
    exitCode: exit.kind === "exited" ? exit.code : run.exitCode,
    usage: progress.usage,
    activity: progress.activity,
    finalText: progress.finalText,
    eventCount: progress.eventCount,
  });
}
