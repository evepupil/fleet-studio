import { findExpired, isTerminalStatus, type TimedRun } from "@fleet/core";
import { finishRun } from "./finisher.js";
import type { EngineContext } from "./types.js";

/** queue_timeout 的说明文字里「N 分钟」不足 1 分钟也要显示成 1，不能显示 0 分钟。 */
function queueTimeoutMinutesLabel(queueTimeoutMs: number): number {
  return Math.max(1, Math.floor(queueTimeoutMs / 60_000));
}

/**
 * 每秒一次的超时兜底检查（模块设计 3.8）：
 * - timeout（工作中超时）：写 killedBy = "timeout" 再结束进程，真正的收尾交给退出流程；
 *   进程号还没拿到时这一轮跳过，下一轮再看。
 * - queue_timeout（排队超时）：这次运行从没启动过，直接收尾为失败。
 */
export async function runTimeoutSweep(ctx: EngineContext): Promise<void> {
  const active = ctx.deps.repos.runs.listActive();
  const timed: TimedRun[] = active.map((run) => ({
    runId: run.id,
    status: run.status === "running" ? "running" : "queued",
    queuedAt: run.queuedAt,
    startedAt: run.startedAt,
    timeoutMs: run.timeoutMs,
    queueTimeoutMs: run.queueTimeoutMs,
  }));
  const expired = findExpired(timed, ctx.now());

  for (const item of expired) {
    try {
      await handleExpired(ctx, item.runId, item.kind);
    } catch (error) {
      ctx.deps.logger.error(`处理运行 ${item.runId} 的超时出错`, error);
    }
  }
}

async function handleExpired(
  ctx: EngineContext,
  runId: string,
  kind: "timeout" | "queue_timeout",
): Promise<void> {
  const run = ctx.deps.repos.runs.get(runId);
  if (run === null || isTerminalStatus(run.status)) {
    return; // 可能已经被别的路径收尾了（例如同时被取消）
  }

  if (kind === "timeout") {
    if (run.pid === null) {
      return; // 还在启动，拿不到进程号：这一轮跳过，下一轮再检查
    }
    // 评审 F3：谁先写 killedBy 谁算——重读到这里还没有 await，run 仍然是新鲜的；
    // 已经有别的路径（比如取消）先标记过就不再覆盖，也不用再抢着结束进程。
    if (run.killedBy !== null) {
      return;
    }
    ctx.deps.repos.runs.update(run.id, { killedBy: "timeout" });
    await ctx.deps.host.kill(run.pid);
    return;
  }

  const worker = ctx.deps.repos.workers.get(run.workerId);
  if (worker === null) {
    ctx.deps.logger.error(`运行 ${run.id} 排队超时，但找不到所属苦工`);
    return;
  }
  const minutes = queueTimeoutMinutesLabel(run.queueTimeoutMs ?? 0);
  // 评审 F1：这一轮开头算出的「谁排队超时了」是一份快照，处理同一轮里前面的运行时
  // 这次运行可能已经被放行成工作中——finishRun 会重读库并核对 expectedStatus，
  // 状态不再是 "queued" 就会放弃收尾，不会把正在跑的运行错杀成 queue_timeout。
  await finishRun(ctx, {
    run,
    worker,
    outcome: { status: "failed", failReason: "queue_timeout", message: `排队超过 ${minutes} 分钟` },
    exitCode: run.exitCode,
    usage: run.usage,
    activity: run.activity,
    finalText: run.finalText,
    eventCount: run.eventCount,
    expectedStatus: "queued",
  });
}
