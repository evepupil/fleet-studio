import {
  buildWorkerSummary,
  FleetError,
  findLatestRun,
  isTerminalStatus,
  type WorkerSummary,
} from "@fleet/core";
import { finishRun } from "./finisher.js";
import { identityOfRun } from "./identity.js";
import type { EngineContext } from "./types.js";

/** 取消工作中的苦工之后，最多等这么久让退出流程走完再返回（模块设计 3.9）。 */
const CANCEL_WAIT_MS = 5000;

/**
 * 取消 cancel(id)：排队中的直接收尾为已取消；工作中的标记 killedBy 并结束进程，
 * 然后等一小段时间让退出流程真正收尾；已经是终态的原样返回，不报错。
 */
export async function cancelWorker(ctx: EngineContext, id: string): Promise<WorkerSummary> {
  const worker = ctx.deps.repos.workers.get(id);
  if (worker === null) {
    throw new FleetError("not_found", `苦工不存在：${id}`);
  }
  const config = ctx.deps.config.current();
  const runs = ctx.deps.repos.runs.listByWorker(id);
  const latest = findLatestRun(worker, runs);
  if (latest === null) {
    throw new FleetError("internal", "苦工没有任何运行记录");
  }

  if (isTerminalStatus(latest.status)) {
    return buildWorkerSummary(worker, runs, config, ctx.snapshots.queuePositions(), ctx.now());
  }

  if (latest.status === "queued") {
    // 评审 F2 同款保护：latest 是前面查出来的快照，finishRun 会自己重读库核对
    // expectedStatus="queued"，万一在此之前已经被放行/收尾也不会覆盖。
    await finishRun(ctx, {
      run: latest,
      worker,
      outcome: { status: "cancelled", failReason: null, message: "已被取消" },
      exitCode: latest.exitCode,
      usage: latest.usage,
      activity: latest.activity,
      finalText: latest.finalText,
      eventCount: latest.eventCount,
      expectedStatus: "queued",
    });
  } else {
    // 工作中：先落库标记，再结束进程；进程号还没拿到时，launcher 拿到 pid 的那一刻会自己发现
    // killedBy 已经是 cancel，立刻结束新起的进程（模块设计 3.5 第 7 步）。
    // 评审 F3：谁先写 killedBy 谁算——latest 是刚查出来的，到这里还没有 await，仍然新鲜；
    // 已经有别的路径（比如超时检查）先标记过就不再覆盖。
    if (latest.killedBy === null) {
      ctx.deps.repos.runs.update(latest.id, { killedBy: "cancel" });
    }
    if (latest.pid !== null) {
      try {
        await ctx.deps.host.kill(latest.pid, identityOfRun(latest));
      } catch (error) {
        ctx.deps.logger.error(`取消苦工 ${id} 时结束进程失败`, error);
      }
    }
    await ctx.waiter.wait([id], "all", CANCEL_WAIT_MS, new AbortController().signal);
  }

  const finalWorker = ctx.deps.repos.workers.get(id) ?? worker;
  const finalRuns = ctx.deps.repos.runs.listByWorker(id);
  return buildWorkerSummary(
    finalWorker,
    finalRuns,
    config,
    ctx.snapshots.queuePositions(),
    ctx.now(),
  );
}
