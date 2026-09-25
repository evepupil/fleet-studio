import type { ShareItem, StatsResponse, StatsTotals, TrendSeries } from "../api/dto.js";
import type { StatsDimension } from "../api/requests.js";
import { addUsage, type Usage, ZERO_USAGE } from "../domain/usage.js";
import { buildBuckets } from "./buckets.js";
import {
  addTask,
  ensureGroup,
  type Group,
  type GroupKeyOf,
  groupRuns,
  rankGroups,
  type ScopedRun,
} from "./grouping.js";
import { startOfLocalDay } from "./localTime.js";
import { chooseGranularity, resolveRange } from "./range.js";
import type { ComputeStatsInput, RunFact, StatsLabels, WorkerFact } from "./types.js";

/**
 * 总览统计的汇总。输入是服务层查好的「事实」，输出就是 StatsResponse；全程纯函数。
 * 「其他」按契约用空 key + null 配色；「未知」（任务事实缺失）固定用最后一个配色位置 7。
 */
const UNKNOWN_LABEL = "未知";
const UNKNOWN_COLOR_INDEX = 7;
const OTHER_LABEL = "其他";

/** 分组键的取法：运行先按 workerId 找到任务事实，再按维度取键。 */
const DIMENSION_KEYS: Readonly<Record<StatsDimension, GroupKeyOf>> = {
  model: (worker) => worker.modelName,
  channel: (worker) => worker.channel,
  project: (worker) => worker.projectKey,
  role: (worker) => worker.role,
};

export function computeStats(input: ComputeStatsInput): StatsResponse {
  const { range, dimension, nowMs, tz, labels } = input;
  const resolved = resolveRange(range, nowMs, tz);
  const todayStart = startOfLocalDay(nowMs, tz);
  const toMs = resolved.toMs;

  // 「全部」的起点取所有事实里最早的那个；一条数据都没有时为 null，表示不设下限。
  let fromMs = resolved.fromMs;
  if (fromMs === null && range.kind === "all") {
    fromMs = earliestFactMs(input.runs, input.workers);
  }

  // 起点为 null 时没有分段，粒度按 nowMs 当起点取（反正不产生分段）。
  const granularity = chooseGranularity(range.kind, fromMs, toMs);
  const buckets = fromMs === null ? [] : buildBuckets(fromMs, toMs, granularity, tz);
  const firstBucket = buckets[0];

  const inRangeRuns = selectRuns(input.runs, fromMs, toMs, nowMs);
  const todayRuns = selectRuns(input.runs, todayStart, nowMs, nowMs);
  const createdInRange = collectCreated(input.workers, fromMs, toMs);
  const workerById = new Map(input.workers.map((worker) => [worker.workerId, worker] as const));

  const dimensionGroups = groupRuns(
    inRangeRuns,
    workerById,
    DIMENSION_KEYS[dimension],
    buckets,
    true,
  );
  const orderedGroups = rankGroups(
    dimensionGroups.values(),
    (group) => group.tokens,
    buckets.length,
  );

  // 按项目的分布：tasks 只数范围内「创建」的任务，tokens / runMs 是范围内运行的合计。
  const projectGroups = groupRuns(inRangeRuns, workerById, DIMENSION_KEYS.project, [], false);
  for (const worker of createdInRange) {
    addTask(ensureGroup(projectGroups, worker.projectKey, 0), worker.workerId);
  }
  const orderedProjects = rankGroups(projectGroups.values(), (group) => group.taskCount, 0);

  return {
    range: {
      kind: range.kind,
      from: firstBucket === undefined ? null : toIso(firstBucket),
      to: toIso(toMs),
    },
    dimension,
    granularity,
    buckets: buckets.map(toIso),
    total: totalsOf(inRangeRuns, createdInRange.length),
    today: totalsOf(todayRuns, collectCreated(input.workers, todayStart, nowMs).length),
    tokenShare: orderedGroups.map((group) => shareItem(group, labels, dimension)),
    tasksByProject: orderedProjects
      .filter((group) => group.isOther || group.taskCount > 0 || group.tokens > 0)
      .map((group) => shareItem(group, labels, "project")),
    tokenTrend: orderedGroups.map((group) => trendSeries(group, labels, dimension)),
  };
}

/** 时间戳是否落在 [fromMs, toMs) 里；起点为 null（不设下限）时一律不算 */
function inRange(ms: number, fromMs: number | null, toMs: number): boolean {
  return fromMs !== null && !Number.isNaN(ms) && ms >= fromMs && ms < toMs;
}

/** 所有事实里最早的毫秒时间戳；解析不出来的时间跳过，没有有效事实时为 null */
function earliestFactMs(runs: readonly RunFact[], workers: readonly WorkerFact[]): number | null {
  let earliest: number | null = null;
  for (const ms of [
    ...runs.map((run) => Date.parse(run.startedAt)),
    ...workers.map((worker) => Date.parse(worker.createdAt)),
  ]) {
    if (!Number.isNaN(ms) && (earliest === null || ms < earliest)) {
      earliest = ms;
    }
  }
  return earliest;
}

/** 按范围筛运行并算好耗时；起点为 null 时按契约没有运行可给，结果是空的 */
function selectRuns(
  runs: readonly RunFact[],
  fromMs: number | null,
  toMs: number,
  nowMs: number,
): ScopedRun[] {
  const scoped: ScopedRun[] = [];
  for (const run of runs) {
    const startedMs = Date.parse(run.startedAt);
    if (!inRange(startedMs, fromMs, toMs)) {
      continue;
    }
    // 结束了用真正的 runMs（0 也要保留），还在跑的算到 nowMs。
    scoped.push({ run, startedMs, ms: run.runMs ?? Math.max(0, nowMs - startedMs) });
  }
  return scoped;
}

/** 创建时间落在 [fromMs, toMs) 里的任务 */
function collectCreated(
  workers: readonly WorkerFact[],
  fromMs: number | null,
  toMs: number,
): WorkerFact[] {
  return workers.filter((worker) => inRange(Date.parse(worker.createdAt), fromMs, toMs));
}

/** 一组统计数。平均耗时的分母只数「至少开跑过一次的任务」，一次没跑过的不参与。 */
function totalsOf(runs: readonly ScopedRun[], tasks: number): StatsTotals {
  let usage: Usage = { ...ZERO_USAGE };
  let runMs = 0;
  const taskIds = new Set<string>();
  for (const { run, ms } of runs) {
    usage = addUsage(usage, {
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      cacheReadTokens: run.cacheReadTokens,
      cacheWriteTokens: run.cacheWriteTokens,
      totalTokens: run.totalTokens,
      costUsd: run.costUsd,
    });
    runMs += ms;
    taskIds.add(run.workerId);
  }
  return {
    usage,
    tasks,
    runMs,
    avgRunMs: taskIds.size === 0 ? null : Math.round(runMs / taskIds.size),
  };
}

function shareItem(group: Group, labels: StatsLabels, dimension: StatsDimension): ShareItem {
  const { label, colorIndex } = itemLabels(group, dimension, labels);
  return {
    key: group.key,
    label,
    colorIndex,
    isOther: group.isOther,
    tasks: group.taskCount,
    tokens: group.tokens,
    runMs: group.runMs,
  };
}

function trendSeries(group: Group, labels: StatsLabels, dimension: StatsDimension): TrendSeries {
  const { label, colorIndex } = itemLabels(group, dimension, labels);
  return {
    key: group.key,
    label,
    colorIndex,
    isOther: group.isOther,
    points: [...group.points],
  };
}

/** 显示名和配色位置：模型、渠道用键本身，项目用项目表，角色用角色名 + seriesColor */
function itemLabels(
  group: Group,
  dimension: StatsDimension,
  labels: StatsLabels,
): { label: string; colorIndex: number | null } {
  if (group.isOther) {
    return { label: OTHER_LABEL, colorIndex: null };
  }
  if (group.isMissing) {
    return { label: UNKNOWN_LABEL, colorIndex: UNKNOWN_COLOR_INDEX };
  }
  const key = group.key;
  switch (dimension) {
    case "project":
      return {
        label: labels.projectName.get(key) ?? key,
        colorIndex: labels.projectColor.get(key) ?? 0,
      };
    case "role":
      return {
        label: labels.roleLabel.get(key) ?? key,
        colorIndex: labels.seriesColor("role", key),
      };
    case "model":
    case "channel":
      return { label: key, colorIndex: labels.seriesColor(dimension, key) };
  }
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}
