import {
  buildWorkerSummary,
  type FleetConfig,
  type PoolLimit,
  poolRuntimes,
  type QueuedEntry,
  queuePositions,
  type RunningEntry,
  type RunRecord,
  type WorkerRecord,
  type WorkerSummary,
} from "@fleet/core";

/**
 * 把演示数据翻译成调度模块要的形状：池上限、在跑条目、排队条目、排队位置。
 * 位置只跟池的容量和顺序有关，跟 enabled 无关，所以停用场景也能沿用同一套位置。
 */

/** 配置里的池按顺序翻成调度上限（顺序就是派活优先级） */
export function demoLimits(config: FleetConfig): PoolLimit[] {
  return config.pools.map((pool) => ({
    poolId: pool.id,
    capacity: pool.capacity,
    perProjectCap: pool.perProjectCap,
    enabled: pool.enabled,
    runtimes: poolRuntimes(pool),
  }));
}

/** 在跑的运行：最新一次运行处于 working 的苦工 */
export function demoRunning(
  workers: readonly WorkerRecord[],
  runs: readonly RunRecord[],
): RunningEntry[] {
  const entries: RunningEntry[] = [];
  for (const worker of workers) {
    if (worker.poolId === null) {
      continue;
    }
    const run = latestRunOf(worker, runs);
    if (run === undefined || run.status !== "running" || run.startedAt === null) {
      continue;
    }
    entries.push({ runId: run.id, poolId: worker.poolId, projectKey: worker.projectKey });
  }
  return entries;
}

/** 排队的运行：最新一次运行处于 queued 的苦工 */
export function demoQueued(
  workers: readonly WorkerRecord[],
  runs: readonly RunRecord[],
): QueuedEntry[] {
  const entries: QueuedEntry[] = [];
  for (const worker of workers) {
    const run = latestRunOf(worker, runs);
    if (run === undefined || run.status !== "queued" || run.queuedAt === null) {
      continue;
    }
    entries.push({
      runId: run.id,
      requestedPoolId: worker.poolId,
      runtime: worker.runtime,
      projectKey: worker.projectKey,
      queuedAt: run.queuedAt,
    });
  }
  return entries;
}

/** 每个排队运行的大概位置；点名的按池编号，公共排队按时间先后编号 */
export function demoQueuePositions(
  config: FleetConfig,
  workers: readonly WorkerRecord[],
  runs: readonly RunRecord[],
): Map<string, number> {
  return queuePositions(demoLimits(config), demoRunning(workers, runs), demoQueued(workers, runs));
}

/** 每个苦工的汇总（含排队位置），给任务查询和详情用 */
export function demoSummaries(
  config: FleetConfig,
  workers: readonly WorkerRecord[],
  runs: readonly RunRecord[],
  nowMs: number,
): WorkerSummary[] {
  const positions = demoQueuePositions(config, workers, runs);
  const runsByWorker = new Map<string, RunRecord[]>();
  for (const run of runs) {
    const list = runsByWorker.get(run.workerId);
    if (list === undefined) {
      runsByWorker.set(run.workerId, [run]);
    } else {
      list.push(run);
    }
  }
  return workers.map((worker) =>
    buildWorkerSummary(worker, runsByWorker.get(worker.id) ?? [], config, positions, nowMs),
  );
}

/** 一个苦工最新一次运行（seq 最大），没有运行返回 undefined */
export function latestRunOf(
  worker: WorkerRecord,
  runs: readonly RunRecord[],
): RunRecord | undefined {
  let latest: RunRecord | undefined;
  for (const run of runs) {
    if (run.workerId !== worker.id) {
      continue;
    }
    if (latest === undefined || run.seq > latest.seq) {
      latest = run;
    }
  }
  return latest;
}
