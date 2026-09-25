import { buildSnapshot, queuePositions as computeQueuePositions, type Snapshot } from "@fleet/core";
import type { ConfigStore, Logger } from "../app/types.js";
import type { Repos } from "../store/types.js";
import { buildSchedulingInputs } from "./schedulingInputs.js";
import type { SnapshotService } from "./types.js";

/** 快照按 5 秒节流重算一次；健康窗口、今日用量都随时间推移变化，不能只靠「脏了没」判断。 */
const RECOMPUTE_INTERVAL_MS = 5000;

interface SnapshotServiceDeps {
  repos: Repos;
  config: ConfigStore;
  logger?: Logger;
  version: string;
  now: () => number;
}

/** 本机时区今天零点，转成 ISO UTC 字符串。 */
function localDayStartIso(nowMs: number): string {
  const local = new Date(nowMs);
  return new Date(local.getFullYear(), local.getMonth(), local.getDate()).toISOString();
}

export function createSnapshotService(deps: SnapshotServiceDeps): SnapshotService {
  const { repos, config, logger, version, now } = deps;
  let dirty = true;
  let cached: Snapshot | null = null;
  let lastComputedAtMs = 0;

  function buildDispatchInputs() {
    const currentConfig = config.current();
    const active = repos.runs.listActive();
    const workerIds = [...new Set(active.map((run) => run.workerId))];
    const workerById = new Map(
      repos.workers.listByIds(workerIds).map((worker) => [worker.id, worker] as const),
    );
    return buildSchedulingInputs(currentConfig, active, workerById, logger);
  }

  function queuePositionsNow(): ReadonlyMap<string, number> {
    const { limits, running, queued } = buildDispatchInputs();
    return computeQueuePositions(limits, running, queued);
  }

  function compute(): Snapshot {
    const nowMs = now();
    const nowIso = new Date(nowMs).toISOString();
    const dayStart = localDayStartIso(nowMs);
    const currentConfig = config.current();

    const windowStartIso = new Date(
      nowMs - Math.max(currentConfig.snapshotWindowHours, 24) * 60 * 60 * 1000,
    ).toISOString();
    const healthWindowStartIso = new Date(nowMs - 10 * 60 * 1000).toISOString();
    // 三个候选取最早的一个，即模块设计要求的 min(今日零点, now-窗口小时, now-10分钟)。
    const endedSinceIso = [dayStart, windowStartIso, healthWindowStartIso].sort()[0] ?? dayStart;

    const activeRuns = repos.runs.listActive();
    const endedRecently = repos.runs.listEndedSince(endedSinceIso);
    const startedToday = repos.runs.listStartedSince(dayStart);

    const workerIdSet = new Set<string>();
    for (const run of [...activeRuns, ...endedRecently, ...startedToday]) {
      workerIdSet.add(run.workerId);
    }
    const workerIds = [...workerIdSet];
    const workers = repos.workers.listByIds(workerIds);
    const runs = repos.runs.listByWorkers(workerIds);
    const projects = repos.projects.list();

    return buildSnapshot({
      version,
      now: nowIso,
      dayStart,
      config: currentConfig,
      configError: config.error(),
      projects,
      workers,
      runs,
      queuePositions: queuePositionsNow(),
    });
  }

  return {
    get(): Snapshot {
      const nowMs = now();
      if (!dirty && cached !== null && nowMs - lastComputedAtMs < RECOMPUTE_INTERVAL_MS) {
        return cached;
      }
      cached = compute();
      dirty = false;
      lastComputedAtMs = nowMs;
      return cached;
    },
    markDirty(): void {
      dirty = true;
    },
    queuePositions(): ReadonlyMap<string, number> {
      return queuePositionsNow();
    },
  };
}
