import { dispatchOrder } from "./dispatchOrder.js";
import type { PoolLimit, QueuedEntry, RunningEntry } from "./types.js";

/** 排队时间权重：解析不出来的排最后，靠运行编号兜底，和 dispatchOrder 保持一致。 */
function queueTimeRank(queuedAt: string): number {
  const ms = Date.parse(queuedAt);
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

function compareQueued(a: QueuedEntry, b: QueuedEntry): number {
  const rankDiff = queueTimeRank(a.queuedAt) - queueTimeRank(b.queuedAt);
  if (rankDiff !== 0) {
    return rankDiff;
  }
  if (a.runId < b.runId) return -1;
  if (a.runId > b.runId) return 1;
  return 0;
}

/**
 * 给快照汇总用：每个排队中的运行大概第几个被放行。
 *
 * 两套编号互不干扰：点名的运行按所在池的 `dispatchOrder`（eligible 再接 blocked）编号，
 * 公共排队（`requestedPoolId === null`）单独按排队时间先后编号。公共排队的条目虽然也参与
 * 每个池的 `dispatchOrder` 计算，但不占任何池的编号——它到底进哪个池，取决于哪个池先空出来。
 * 池已删除的点名条目不出现在结果里；停用的池照样编号（位置是「一旦启用」的顺序）。
 */
export function queuePositions(
  limits: readonly PoolLimit[],
  running: readonly RunningEntry[],
  queued: readonly QueuedEntry[],
): Map<string, number> {
  const requestedPoolOf = new Map(
    queued.map((entry) => [entry.runId, entry.requestedPoolId] as const),
  );
  const positions = new Map<string, number>();

  for (const limit of limits) {
    const order = dispatchOrder(limit, running, queued);
    let position = 1;
    for (const runId of [...order.eligible, ...order.blocked]) {
      // 只给点名这个池的编号；公共排队的编号在下面统一算。
      if (requestedPoolOf.get(runId) !== limit.poolId) {
        continue;
      }
      positions.set(runId, position);
      position += 1;
    }
  }

  const shared = queued.filter((entry) => entry.requestedPoolId === null).sort(compareQueued);
  shared.forEach((entry, index) => {
    positions.set(entry.runId, index + 1);
  });

  return positions;
}
