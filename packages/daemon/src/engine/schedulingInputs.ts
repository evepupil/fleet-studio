import {
  type FleetConfig,
  type PoolLimit,
  poolRuntimes,
  type QueuedEntry,
  type RunningEntry,
  type RunRecord,
  type WorkerRecord,
} from "@fleet/core";
import type { Logger } from "../app/types.js";

export interface SchedulingInputs {
  limits: PoolLimit[];
  running: RunningEntry[];
  queued: QueuedEntry[];
}

/** 派活和快照共用同一份输入映射，避免两处对公共排队和池优先级理解不一致。 */
export function buildSchedulingInputs(
  config: FleetConfig,
  activeRuns: readonly RunRecord[],
  workersById: ReadonlyMap<string, WorkerRecord>,
  logger?: Pick<Logger, "warn">,
): SchedulingInputs {
  const limits: PoolLimit[] = config.pools.map((pool) => ({
    poolId: pool.id,
    capacity: pool.capacity,
    perProjectCap: pool.perProjectCap,
    enabled: pool.enabled,
    runtimes: poolRuntimes(pool),
  }));
  const running: RunningEntry[] = [];
  const queued: QueuedEntry[] = [];

  for (const run of activeRuns) {
    const worker = workersById.get(run.workerId);
    if (worker === undefined) {
      continue;
    }
    if (run.status === "running") {
      if (worker.poolId === null) {
        logger?.warn(`工作中的运行 ${run.id} 没有实际池编号，跳过调度输入`);
        continue;
      }
      running.push({ runId: run.id, poolId: worker.poolId, projectKey: worker.projectKey });
    } else {
      queued.push({
        runId: run.id,
        requestedPoolId: worker.poolId,
        runtime: worker.runtime,
        projectKey: worker.projectKey,
        queuedAt: run.queuedAt,
      });
    }
  }

  return { limits, running, queued };
}
