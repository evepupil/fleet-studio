import {
  assembleTimeline,
  buildSnapshot,
  buildWorkerDetail,
  type PoolLimit,
  type ProjectRecord,
  type QueuedEntry,
  queuePositions,
  type RunningEntry,
  type RunRecord,
  type Snapshot,
  type TimelineEvent,
  type WorkerDetail,
  type WorkerRecord,
} from "@fleet/core";
import {
  buildWorker,
  busyWorkerSpecs,
  DEMO_DAY_START,
  DEMO_NOW,
  demoConfig,
  demoProjects,
  FAILURE_CONFIG_ERROR,
  failureWorkerSpecs,
  type WorkerSpec,
} from "./records";
import { demoDrafts } from "./timelines";

export type DemoScenarioName = "busy" | "empty" | "failure" | "offline";

export const DEMO_SCENARIOS: readonly DemoScenarioName[] = ["busy", "empty", "failure", "offline"];

export function isDemoScenarioName(value: string): value is DemoScenarioName {
  return value === "busy" || value === "empty" || value === "failure" || value === "offline";
}

export interface DemoScenario {
  snapshot: Snapshot;
  details: ReadonlyMap<string, WorkerDetail>;
  timelines: ReadonlyMap<string, TimelineEvent[]>;
  /** offline 场景的连接最终是 lost，其余是 open */
  connection: "open" | "lost";
}

interface Dataset {
  workers: WorkerRecord[];
  runs: RunRecord[];
  configError: string | null;
}

function datasetOf(specs: readonly WorkerSpec[], configError: string | null): Dataset {
  const workers: WorkerRecord[] = [];
  const runs: RunRecord[] = [];
  for (const spec of specs) {
    const built = buildWorker(spec);
    workers.push(built.worker);
    runs.push(...built.runs);
  }
  return { workers, runs, configError };
}

/** 用核心层的同一套规则算排队位置，保证演示快照和真实服务的口径一致 */
function positionsOf(dataset: Dataset): ReadonlyMap<string, number> {
  const workerById = new Map(dataset.workers.map((worker) => [worker.id, worker]));
  const limits: PoolLimit[] = demoConfig.pools.map((pool) => ({
    poolId: pool.id,
    capacity: pool.capacity,
    perProjectCap: pool.perProjectCap,
  }));
  const running: RunningEntry[] = [];
  const queued: QueuedEntry[] = [];
  for (const run of dataset.runs) {
    const worker = workerById.get(run.workerId);
    if (worker === undefined) continue;
    if (run.status === "running") {
      running.push({ runId: run.id, poolId: worker.poolId, projectKey: worker.projectKey });
    } else if (run.status === "queued") {
      queued.push({ runId: run.id, poolId: worker.poolId, projectKey: worker.projectKey, queuedAt: run.queuedAt });
    }
  }
  return queuePositions(limits, running, queued);
}

function projectOf(key: string): ProjectRecord {
  const found = demoProjects.find((project) => project.key === key);
  if (found !== undefined) return found;
  return { key, path: key, name: key, colorIndex: 0, createdAt: DEMO_NOW };
}

export function buildDemoScenario(name: DemoScenarioName): DemoScenario {
  const dataset =
    name === "empty"
      ? datasetOf([], null)
      : name === "failure"
        ? datasetOf(failureWorkerSpecs(), FAILURE_CONFIG_ERROR)
        : datasetOf(busyWorkerSpecs, null);
  const positions = positionsOf(dataset);
  const snapshot = buildSnapshot({
    version: "0.1.0",
    now: DEMO_NOW,
    dayStart: DEMO_DAY_START,
    config: demoConfig,
    configError: dataset.configError,
    projects: demoProjects,
    workers: dataset.workers,
    runs: dataset.runs,
    queuePositions: positions,
  });
  const details = new Map<string, WorkerDetail>();
  const timelines = new Map<string, TimelineEvent[]>();
  for (const worker of dataset.workers) {
    const runs = dataset.runs.filter((run) => run.workerId === worker.id).sort((a, b) => a.seq - b.seq);
    details.set(worker.id, buildWorkerDetail(worker, runs, projectOf(worker.projectKey), demoConfig, positions));
    timelines.set(worker.id, assembleTimeline(runs.map((run) => ({ run, drafts: demoDrafts[run.id] ?? [] }))));
  }
  return { snapshot, details, timelines, connection: name === "offline" ? "lost" : "open" };
}

/** DEMO_NOW 的毫秒数，给演示数据源的固定时钟用 */
export const DEMO_NOW_MS = Date.parse(DEMO_NOW);
