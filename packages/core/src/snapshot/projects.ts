import type { ProjectView, WorkerSummary } from "../api/dto.js";
import type { ProjectRecord, RunRecord, WorkerRecord } from "../domain/records.js";
import type { RunStatus } from "../domain/status.js";
import { addUsage, type Usage, ZERO_USAGE } from "../domain/usage.js";

/**
 * 项目视图只包含快照苦工列表（已裁剪到 300 条以内）里出现过的项目，
 * 但今日用量特意按全部输入运行统计——用量要反映真实状态，不受苦工列表展示上限影响。
 */
export function buildProjectViews(
  snapshotWorkers: readonly WorkerSummary[],
  workers: readonly WorkerRecord[],
  runs: readonly RunRecord[],
  projects: readonly ProjectRecord[],
  dayStart: string,
): ProjectView[] {
  const grouped = groupWorkersByProject(snapshotWorkers);
  const projectByKey = new Map(projects.map((project) => [project.key, project] as const));
  const usageByProject = sumUsageByProject(workers, runs, dayStart);

  const views = [...grouped.entries()].map(([projectKey, group]) =>
    buildProjectView(
      projectKey,
      group,
      projectByKey.get(projectKey) ?? null,
      usageByProject.get(projectKey),
    ),
  );

  return views.sort(compareProjectViews);
}

function groupWorkersByProject(workers: readonly WorkerSummary[]): Map<string, WorkerSummary[]> {
  const grouped = new Map<string, WorkerSummary[]>();
  for (const worker of workers) {
    const list = grouped.get(worker.projectKey);
    if (list) {
      list.push(worker);
    } else {
      grouped.set(worker.projectKey, [worker]);
    }
  }
  return grouped;
}

/** 五种状态都要有键，没有的为 0；顺序和 RunStatus 的定义保持一致，方便对照。 */
function emptyCounts(): Record<RunStatus, number> {
  return { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
}

function buildProjectView(
  projectKey: string,
  group: readonly WorkerSummary[],
  record: ProjectRecord | null,
  usageToday: Usage | undefined,
): ProjectView {
  const counts = emptyCounts();
  for (const worker of group) {
    counts[worker.status] += 1;
  }

  // group 一定非空（能进这个函数说明至少有一个苦工属于这个项目），reduce 的初值只是让类型确定下来。
  const lastActivityAt = group.reduce<string | null>((latest, worker) => {
    const candidate =
      worker.lastActivityAt ?? worker.endedAt ?? worker.startedAt ?? worker.queuedAt;
    if (latest === null || Date.parse(candidate) > Date.parse(latest)) {
      return candidate;
    }
    return latest;
  }, null);

  const meta = resolveProjectMeta(projectKey, record);

  return {
    key: projectKey,
    path: meta.path,
    name: meta.name,
    colorIndex: meta.colorIndex,
    counts,
    usageToday: usageToday ?? { ...ZERO_USAGE },
    lastActivityAt,
  };
}

interface ProjectMeta {
  path: string;
  name: string;
  colorIndex: number;
}

/** 找不到项目记录时就地补一个：path 取 key，name 取路径最后一段，colorIndex 固定 0。 */
function resolveProjectMeta(projectKey: string, record: ProjectRecord | null): ProjectMeta {
  if (record) {
    return { path: record.path, name: record.name, colorIndex: record.colorIndex };
  }
  return { path: projectKey, name: lastPathSegment(projectKey), colorIndex: 0 };
}

/** 兼容正反斜杠的路径分隔符，取最后一个非空段。 */
function lastPathSegment(key: string): string {
  const segments = key.split(/[\\/]+/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? key;
}

/** 项目今日用量：按全部输入运行统计（不限于快照苦工列表），startedAt 落在今天零点之后（含）才算。 */
function sumUsageByProject(
  workers: readonly WorkerRecord[],
  runs: readonly RunRecord[],
  dayStart: string,
): Map<string, Usage> {
  const projectKeyByWorkerId = new Map(
    workers.map((worker) => [worker.id, worker.projectKey] as const),
  );
  const dayStartMs = Date.parse(dayStart);
  const usage = new Map<string, Usage>();

  for (const run of runs) {
    if (run.startedAt === null || Date.parse(run.startedAt) < dayStartMs) {
      continue;
    }
    const projectKey = projectKeyByWorkerId.get(run.workerId);
    if (projectKey === undefined) {
      continue;
    }
    const current = usage.get(projectKey) ?? { ...ZERO_USAGE };
    usage.set(projectKey, addUsage(current, run.usage));
  }

  return usage;
}

/** 有工作中苦工的项目在前；再按 lastActivityAt 倒序；再按 name。 */
function compareProjectViews(a: ProjectView, b: ProjectView): number {
  const aRunning = a.counts.running > 0;
  const bRunning = b.counts.running > 0;
  if (aRunning !== bRunning) {
    return aRunning ? -1 : 1;
  }

  const aMs = a.lastActivityAt === null ? Number.NEGATIVE_INFINITY : Date.parse(a.lastActivityAt);
  const bMs = b.lastActivityAt === null ? Number.NEGATIVE_INFINITY : Date.parse(b.lastActivityAt);
  if (aMs !== bMs) {
    return bMs - aMs;
  }

  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}
