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
  await finishRun(ctx, {
    run,
    worker,
    outcome: { status: "failed", failReason: "queue_timeout", message: `排队超过 ${minutes} 分钟` },
    exitCode: run.exitCode,
    usage: run.usage,
    activity: run.activity,
    finalText: run.finalText,
    eventCount: run.eventCount,
  });
}
