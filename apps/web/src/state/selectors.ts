import type { ProjectView, RunStatus, Snapshot, WorkerSummary } from "@fleet/core";
import type { ListFilter } from "./selectionStore";

export interface ProjectGroup {
  project: ProjectView;
  workers: WorkerSummary[];
}

const ACTIVE_STATUSES: ReadonlySet<RunStatus> = new Set(["queued", "running"]);

/** 排队位置缺失时排到队尾；业务上排队中的苦工总有位置，这只是防御性兜底。 */
const NO_POSITION = Number.MAX_SAFE_INTEGER;

function toTime(iso: string | null): number {
  return iso === null ? 0 : Date.parse(iso);
}

/** 组内排序：工作中（开跑时间升序）→ 排队中（排队位置升序）→ 其余（结束时间倒序）。 */
function sortWorkers(workers: readonly WorkerSummary[]): WorkerSummary[] {
  const running = workers
    .filter((worker) => worker.status === "running")
    .sort((a, b) => toTime(a.startedAt) - toTime(b.startedAt));
  const queued = workers
    .filter((worker) => worker.status === "queued")
    .sort((a, b) => (a.queuePosition ?? NO_POSITION) - (b.queuePosition ?? NO_POSITION));
  const rest = workers
    .filter((worker) => worker.status !== "running" && worker.status !== "queued")
    .sort((a, b) => toTime(b.endedAt) - toTime(a.endedAt));
  return [...running, ...queued, ...rest];
}

/**
 * 按项目分组的苦工列表，顺序同 snapshot.projects。listFilter 为 active 时只留排队中和工作中的苦工，
 * 因此变空的组直接去掉（snapshot.projects 本身只包含有苦工的项目，all 筛选下不会出现空组）。
 */
export function selectProjectGroups(snapshot: Snapshot, listFilter: ListFilter): ProjectGroup[] {
  const groups: ProjectGroup[] = [];
  for (const project of snapshot.projects) {
    const workers = snapshot.workers.filter((worker) => worker.projectKey === project.key);
    const filtered =
      listFilter === "active"
        ? workers.filter((worker) => ACTIVE_STATUSES.has(worker.status))
        : workers;
    if (filtered.length === 0) {
      continue;
    }
    groups.push({ project, workers: sortWorkers(filtered) });
  }
  return groups;
}

export function selectWorker(snapshot: Snapshot, id: string): WorkerSummary | null {
  return snapshot.workers.find((worker) => worker.id === id) ?? null;
}

/** 排队中 + 工作中的苦工总数 */
export function countActive(snapshot: Snapshot): number {
  return snapshot.workers.filter((worker) => ACTIVE_STATUSES.has(worker.status)).length;
}

/** 快照里全部苦工数 */
export function countAll(snapshot: Snapshot): number {
  return snapshot.workers.length;
}

export function selectProjectByKey(snapshot: Snapshot, key: string): ProjectView | null {
  return snapshot.projects.find((project) => project.key === key) ?? null;
}
