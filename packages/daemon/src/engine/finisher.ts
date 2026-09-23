import { assertTransition, isTerminalStatus, resolveRunOutcome } from "@fleet/core";
import type { RunPatch } from "../store/types.js";
import type { EngineContext, FinishInput, ResolveAndFinishInput } from "./types.js";

/**
 * 收尾：结局已经判定好，这里只管一次性写库、刷新时间线、通知、请求放行（模块设计 3.7）。
 *
 * 评审 F1/F2/F4：调用方传进来的 `input.run` 可能是放行循环/超时检查开始时的一份旧快照，
 * 处理别的运行时如果 await 了一段时间，这份快照就可能已经过期（这次运行已经被放行、被取消、
 * 甚至已经被别的路径收尾过）。所以这里第一件事永远是重读一次库，用重读到的状态做判断和收尾，
 * 绝不相信调用方传入的 run.status。重读、终态检查、expectedStatus 检查、assertTransition、
 * 写库这五步之间不能有 await——都是同步调用，不会被别的异步任务插进来。
 * 一个运行的收尾出错（assertTransition 抛错）会直接向上抛，调用方各自包 try/catch。
 *
 * 返回值：true 表示这次调用真的把运行改成了终态；false 表示因为已经是终态或状态不符预期而放弃，
 * 调用方一般不需要关心这个返回值，但需要时可以用来判断「是不是我把它收尾的」。
 */
export async function finishRun(ctx: EngineContext, input: FinishInput): Promise<boolean> {
  const { worker, outcome } = input;

  const freshRun = ctx.deps.repos.runs.get(input.run.id);
  if (freshRun === null) {
    ctx.deps.logger.error(`运行 ${input.run.id} 收尾时找不到记录，放弃收尾`);
    return false;
  }
  if (isTerminalStatus(freshRun.status)) {
    ctx.deps.logger.info(`运行 ${freshRun.id} 已经是终态（${freshRun.status}），跳过重复收尾`);
    return false;
  }
  if (input.expectedStatus !== undefined && freshRun.status !== input.expectedStatus) {
    ctx.deps.logger.info(
      `运行 ${freshRun.id} 收尾时状态已经变成「${freshRun.status}」（期望「${input.expectedStatus}」），跳过`,
    );
    return false;
  }
  assertTransition(freshRun.status, outcome.status);

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
  ctx.deps.repos.runs.update(freshRun.id, patch);

  await ctx.timelines.refresh(worker.id);
  ctx.notifyWorker(worker.id);
  ctx.requestDispatch();
  return true;
}

/**
 * 有事件流进展和进程退出信息时的收尾入口：先用 resolveRunOutcome 判定结局再写库。
 *
 * 评审指出：接管场景下，服务刚重启时发来的取消请求会被忽略，因为旧代码用调用方传入的
 * run.killedBy（可能是重启前查到的、早已过期的一份快照）去判定结局。这里改成重读一次库，
 * 用重读到的 killedBy/timeoutMs 判定，不再相信调用方传进来的 run 对象。
 * 这里的调用方（runTracker 的进程退出/接管存活探测、recovery 的「进程已不在」分支）
 * 涉及的运行在被跟踪之前一定已经处于工作中，所以 expectedStatus 固定传 "running"。
 */
export async function resolveAndFinishRun(
  ctx: EngineContext,
  input: ResolveAndFinishInput,
): Promise<boolean> {
  const { worker, progress, exit } = input;
  const freshRun = ctx.deps.repos.runs.get(input.run.id);
  if (freshRun === null) {
    ctx.deps.logger.error(`运行 ${input.run.id} 收尾时找不到记录，放弃收尾`);
    return false;
  }
  const outcome = resolveRunOutcome({
    progress,
    exit,
    killedBy: freshRun.killedBy,
    timeoutMs: freshRun.timeoutMs,
  });
  return finishRun(ctx, {
    run: freshRun,
    worker,
    outcome,
    exitCode: exit.kind === "exited" ? exit.code : freshRun.exitCode,
    usage: progress.usage,
    activity: progress.activity,
    finalText: progress.finalText,
    eventCount: progress.eventCount,
    expectedStatus: "running",
  });
}
