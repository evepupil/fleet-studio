import {
  assembleTimeline,
  buildSnapshot,
  buildWorkerDetail,
  type FleetConfig,
  type ProjectRecord,
  type RunRecord,
  type Snapshot,
  startOfLocalDay,
  type TimelineEvent,
  type TimeZone,
  type WorkerDetail,
  type WorkerRecord,
} from "@fleet/core";
import { busyWorkerSpecs } from "./busySpecs";
import { failureWorkerSpecs } from "./failureSpecs";
import { buildHistory } from "./history";
import {
  browserTimeZone,
  buildWorker,
  CLOUD,
  DEMO_NOW,
  DEMO_NOW_MS,
  demoConfig,
  demoProjects,
  FAILURE_CONFIG_ERROR,
  ONAHO,
  queuedSpec,
  type WorkerSpec,
} from "./records";
import { demoQueuePositions } from "./scheduling";
import { demoDrafts } from "./timelines";

/**
 * 五个演示场景：把在跑的一批、历史、故障批拼成完整的记录，再用核心层的同一套规则
 * 算出快照、详情和时间线。所有时间都相对固定的 DEMO_NOW，结果每次一致。
 */

export type DemoScenarioName = "busy" | "empty" | "failure" | "offline" | "disabled";

export const DEMO_SCENARIOS: readonly DemoScenarioName[] = [
  "busy",
  "empty",
  "failure",
  "offline",
  "disabled",
];

export function isDemoScenarioName(value: string): value is DemoScenarioName {
  return (
    value === "busy" ||
    value === "empty" ||
    value === "failure" ||
    value === "offline" ||
    value === "disabled"
  );
}

export interface DemoScenario {
  config: FleetConfig;
  projects: ProjectRecord[];
  workers: WorkerRecord[];
  runs: RunRecord[];
  snapshot: Snapshot;
  details: ReadonlyMap<string, WorkerDetail>;
  timelines: ReadonlyMap<string, TimelineEvent[]>;
  /** offline 场景的连接最终是 lost，其余是 open */
  connection: "open" | "lost";
}

/** 停用场景在公共排队里多出的 2 个苦工（见 design/演示数据.md 第 4 节） */
const disabledExtraSpecs: readonly WorkerSpec[] = [
  queuedSpec("wr3w6x", CLOUD, null, "tester", "给统计口径补夏令时用例", 6.0),
  queuedSpec("ws4x7y", ONAHO, null, "worker", "整理 wiki 首页的导航", 8.0),
];

interface Dataset {
  workers: WorkerRecord[];
  runs: RunRecord[];
}

function datasetOf(specs: readonly WorkerSpec[]): Dataset {
  const workers: WorkerRecord[] = [];
  const runs: RunRecord[] = [];
  for (const spec of specs) {
    const built = buildWorker(spec);
    workers.push(built.worker);
    runs.push(...built.runs);
  }
  return { workers, runs };
}

/** 演示用的版本号，和第一版一致 */
const DEMO_VERSION = "0.1.0";

/** 池全部停用的配置（停用场景用） */
function disabledConfig(): FleetConfig {
  return {
    ...demoConfig,
    pools: demoConfig.pools.map((pool) => ({ ...pool, enabled: false })),
  };
}

/** 用核心层的同一套规则算快照；demoSource 改设置后也走这里重算 */
export function buildDemoSnapshot(
  config: FleetConfig,
  configError: string | null,
  workers: readonly WorkerRecord[],
  runs: readonly RunRecord[],
  tz: TimeZone,
): Snapshot {
  return buildSnapshot({
    version: DEMO_VERSION,
    now: DEMO_NOW,
    dayStart: new Date(startOfLocalDay(DEMO_NOW_MS, tz)).toISOString(),
    config,
    configError,
    projects: demoProjects,
    workers,
    runs,
    queuePositions: demoQueuePositions(config, workers, runs),
  });
}

function projectOf(key: string): ProjectRecord {
  const found = demoProjects.find((project) => project.key === key);
  if (found !== undefined) {
    return found;
  }
  return { key, path: key, name: key, colorIndex: 0, createdAt: DEMO_NOW };
}

export function buildDemoScenario(
  name: DemoScenarioName,
  tz: TimeZone = browserTimeZone,
): DemoScenario {
  const config = name === "disabled" ? disabledConfig() : demoConfig;
  const configError = name === "failure" ? FAILURE_CONFIG_ERROR : null;

  // empty 一个苦工都没有；failure 是故障批 + 历史；其余是在跑的一批 + 历史。
  let dataset: Dataset = { workers: [], runs: [] };
  if (name === "failure") {
    dataset = datasetOf(failureWorkerSpecs());
  } else if (name !== "empty") {
    dataset = datasetOf(
      name === "disabled" ? [...busyWorkerSpecs, ...disabledExtraSpecs] : busyWorkerSpecs,
    );
  }
  const history = name === "empty" ? { workers: [], runs: [] } : buildHistory(tz);
  const workers = [...dataset.workers, ...history.workers];
  const runs = [...dataset.runs, ...history.runs];
  const projects = name === "empty" ? [] : [...demoProjects];

  const snapshot = buildDemoSnapshot(config, configError, workers, runs, tz);
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

  const details = new Map<string, WorkerDetail>();
  const timelines = new Map<string, TimelineEvent[]>();
  for (const worker of workers) {
    const workerRuns = (runsByWorker.get(worker.id) ?? []).sort((a, b) => a.seq - b.seq);
    details.set(
      worker.id,
      buildWorkerDetail(
        worker,
        workerRuns,
        projectOf(worker.projectKey),
        config,
        positions,
        DEMO_NOW_MS,
      ),
    );
    // 只有第一版那 5 个运行带事件，其余苦工的时间线是空数组。
    const hasDrafts = workerRuns.some((run) => demoDrafts[run.id] !== undefined);
    timelines.set(
      worker.id,
      hasDrafts
        ? assembleTimeline(workerRuns.map((run) => ({ run, drafts: demoDrafts[run.id] ?? [] })))
        : [],
    );
  }

  return {
    config,
    projects,
    workers,
    runs,
    snapshot,
    details,
    timelines,
    connection: name === "offline" ? "lost" : "open",
  };
}

export { DEMO_NOW_MS };
