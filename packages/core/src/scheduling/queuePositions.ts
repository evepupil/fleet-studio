import { dispatchOrder } from "./dispatchOrder.js";
import type { PoolLimit, QueuedEntry, RunningEntry } from "./types.js";

/**
 * 给快照汇总用：每个排队中的运行大概第几个被放行。
 * 每个池分别编号，eligible 按放行顺序编 1、2、3……，blocked 接着往后编；
 * 找不到所属池（池已被删除）的排队条目不会出现在返回的 Map 里。
 */
export function queuePositions(
  limits: readonly PoolLimit[],
  running: readonly RunningEntry[],
  queued: readonly QueuedEntry[],
): Map<string, number> {
  const positions = new Map<string, number>();
  for (const limit of limits) {
    const order = dispatchOrder(limit, running, queued);
    let position = 1;
    for (const runId of [...order.eligible, ...order.blocked]) {
      positions.set(runId, position);
      position += 1;
    }
  }
  return positions;
}
