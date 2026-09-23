import { dispatchOrder } from "./dispatchOrder.js";
import type { PoolLimit, QueuedEntry, RunningEntry } from "./types.js";

/**
 * 调度引擎每次触发放行时调的入口：按 limits 给的池顺序逐个决定这一刻放行谁。
 * 每池的空位 = 容量 − 在跑数；空位不够（含容量被调小到低于在跑数）就跳过这个池。
 * `limits` 里找不到对应项的排队条目（池已被删除）不会出现在任何结果里，
 * 由调度引擎自己按“池已删除”另外处理。
 */
export function planDispatch(
  limits: readonly PoolLimit[],
  running: readonly RunningEntry[],
  queued: readonly QueuedEntry[],
): string[] {
  const result: string[] = [];
  for (const limit of limits) {
    const runningCount = running.filter((entry) => entry.poolId === limit.poolId).length;
    const freeSlots = limit.capacity - runningCount;
    if (freeSlots <= 0) {
      continue;
    }
    const order = dispatchOrder(limit, running, queued);
    result.push(...order.eligible.slice(0, freeSlots));
  }
  return result;
}
