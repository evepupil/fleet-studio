import type { LiveTotals, PoolView } from "../api/dto.js";
import type { RunRecord, WorkerRecord } from "../domain/records.js";
import { findLatestRun } from "./workers.js";

/**
 * 实时卡片的五个数。全部来自"此刻的状态"：在跑、排队、重试，
 * 所以特意用全部输入记录算（不受快照苦工列表 300 条上限影响），否则卡片会少报。
 */
export function buildLiveTotals(
  workers: readonly WorkerRecord[],
  runsByWorkerId: ReadonlyMap<string, RunRecord[]>,
  pools: readonly PoolView[],
): LiveTotals {
  // 在跑格子数直接取各池 running 之和：停用池里还没跑完的运行也在里面。
  const slotsUsed = pools.reduce((sum, pool) => sum + pool.running, 0);
  const slotsTotal = pools.reduce((sum, pool) => (pool.enabled ? sum + pool.capacity : sum), 0);

  let running = 0;
  let queued = 0;
  let retrying = 0;

  for (const worker of workers) {
    const latest = findLatestRun(worker, runsByWorkerId.get(worker.id) ?? []);
    // 一次运行都没有的苦工视为数据不一致，按排队中处理（和 buildWorkerSummary 一致）。
    const status = latest?.status ?? "queued";
    if (status === "running") {
      running += 1;
      if (latest !== null && latest.retry !== null) {
        retrying += 1;
      }
    } else if (status === "queued") {
      queued += 1;
    }
  }

  return { slotsUsed, slotsTotal, running, queued, retrying };
}

/**
 * 公共排队数：没点名（或还没被放行）因而 poolId 为 null 的苦工，其排队中的运行数。
 * 点名的排队已经算进各自池的 queued，不能重复计。
 */
export function countSharedQueued(
  runs: readonly RunRecord[],
  workerById: ReadonlyMap<string, WorkerRecord>,
): number {
  let count = 0;
  for (const run of runs) {
    if (run.status !== "queued") {
      continue;
    }
    const worker = workerById.get(run.workerId);
    if (worker?.poolId === null) {
      count += 1;
    }
  }
  return count;
}
