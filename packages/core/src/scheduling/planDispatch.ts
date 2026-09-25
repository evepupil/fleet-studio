import { dispatchOrder } from "./dispatchOrder.js";
import type { DispatchDecision, PoolLimit, QueuedEntry, RunningEntry } from "./types.js";

/**
 * 调度引擎每次触发放行时调的入口：按 limits 给的池顺序（就是派活优先级）逐个决定这一刻放行谁。
 *
 * 每轮维护一份「还没被分走的排队」：一个公共排队的运行只会被优先级最高、且还有空位的那个池接走，
 * 所以同一轮里不会重复放行；点名了池的只会进点名的池，别的池看不见它。
 * 每池的空位 = 容量 − 在跑数；池停用或空位不够（含容量被调小到低于在跑数）就跳过这个池。
 * `limits` 里找不到对应项的排队条目（池已被删除）不会出现在任何结果里，
 * 由调度引擎自己按“池已删除”另外处理。
 */
export function planDispatch(
  limits: readonly PoolLimit[],
  running: readonly RunningEntry[],
  queued: readonly QueuedEntry[],
): DispatchDecision[] {
  let remaining: QueuedEntry[] = [...queued];
  const result: DispatchDecision[] = [];

  for (const limit of limits) {
    if (!limit.enabled) {
      continue;
    }
    const runningCount = running.filter((entry) => entry.poolId === limit.poolId).length;
    const freeSlots = limit.capacity - runningCount;
    if (freeSlots <= 0) {
      continue;
    }
    const order = dispatchOrder(limit, running, remaining);
    const taken = order.eligible.slice(0, freeSlots);
    for (const runId of taken) {
      result.push({ runId, poolId: limit.poolId });
    }
    if (taken.length > 0) {
      const takenIds = new Set(taken);
      remaining = remaining.filter((entry) => !takenIds.has(entry.runId));
    }
  }

  return result;
}
