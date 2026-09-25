import { bucketIndexOf } from "./buckets.js";
import { mergeTopN } from "./topN.js";
import { type RunFact, STATS_TOP_N, type WorkerFact } from "./types.js";

/**
 * 分组累加器：把范围内的运行按分组键聚起来，再挑出前 N 名。
 * computeStats 只管选范围、定分段和拼响应，聚合的中间状态都收在这里。
 */

/** 分组键为 null（数据不一致）时对外的 key */
export const UNKNOWN_KEY = "unknown";

/**
 * 「取不到键」那组在 map 里的键。用 Symbol 而不是字符串：业务里真有一个模型 / 渠道 /
 * 角色叫 "unknown" 时，两者必须分开成两组，否则真实数据和缺失数据会被错误地并在一起。
 * Symbol 和任何字符串都不可能相等，所以不需要给业务键加前缀，也不用担心前缀被撞。
 */
export const MISSING_GROUP_KEY: unique symbol = Symbol("stats.missing");

/** 分组 map 的键：业务键是字符串，「取不到键」那组是 Symbol */
export type GroupMapKey = string | typeof MISSING_GROUP_KEY;

/** 「其他」按契约用空字符串做 key；label 和配色是显示层的事，由调用方给 */
const OTHER_KEY = "";

/** 已经按范围筛过、并算好耗时的运行 */
export interface ScopedRun {
  run: RunFact;
  startedMs: number;
  /** 真正在跑的毫秒数：结束了用 runMs，还在跑的算到 nowMs */
  ms: number;
}

/** 一个分组的累加器；「其他」是把落选的分组合并出来的，同样用这个形状 */
export interface Group {
  /** 对外 key：业务键，或「取不到键」时的 UNKNOWN_KEY */
  key: string;
  /**
   * 这一组是不是「取不到键」那组。key 为 UNKNOWN_KEY，但业务里也可能真叫 unknown，
   * 光看 key 分不出来，所以单独记一个标志（显示名「未知」只给这一组）。
   */
  isMissing: boolean;
  isOther: boolean;
  /** 组里出现过的任务 id，只用来在组内去重（同一个任务跑多次只算一个）；合并后为空 */
  seenTasks: Set<string>;
  /**
   * 任务数。组内按 id 去重；合并「其他」时按规格直接相加、不再去重。
   * 同一维度的各分组本就互不相交，所以两种算法在真实数据上结果一致。
   */
  taskCount: number;
  tokens: number;
  runMs: number;
  /** 与 buckets 一一对应的 token 合计 */
  points: number[];
}

/** 从任务事实里取分组键；返回 null 表示取不到（数据不一致） */
export type GroupKeyOf = (worker: WorkerFact) => string | null;

/**
 * 按分组键聚合运行；找不到任务事实的运行跳过（它连分组键都取不到）。
 * `countRunsAsTasks` 为 false 时只累加 tokens / runMs：按项目的分布里 tasks 数是
 * 「创建的任务数」，由调用方另外补。
 */
export function groupRuns(
  runs: readonly ScopedRun[],
  workerById: ReadonlyMap<string, WorkerFact>,
  keyOf: GroupKeyOf,
  buckets: readonly number[],
  countRunsAsTasks: boolean,
): Map<GroupMapKey, Group> {
  const groups = new Map<GroupMapKey, Group>();
  for (const scoped of runs) {
    const worker = workerById.get(scoped.run.workerId);
    if (worker === undefined) {
      continue;
    }
    const key = keyOf(worker);
    // 取不到键时用 Symbol 当 map 键，Group.key 对外仍显示成 "unknown"。
    const group = ensureGroup(groups, key === null ? MISSING_GROUP_KEY : key, buckets.length);
    if (countRunsAsTasks) {
      addTask(group, scoped.run.workerId);
    }
    group.tokens += scoped.run.totalTokens;
    group.runMs += scoped.ms;
    // 归段只看开跑时刻；bucketIndexOf 用二分，每条事实一次。
    const index = bucketIndexOf(scoped.startedMs, buckets);
    const point = index < 0 ? undefined : group.points[index];
    if (point !== undefined) {
      group.points[index] = point + scoped.run.totalTokens;
    }
  }
  return groups;
}

export function ensureGroup(
  groups: Map<GroupMapKey, Group>,
  key: GroupMapKey,
  bucketCount: number,
): Group {
  const existing = groups.get(key);
  if (existing) {
    return existing;
  }
  // 只有 Symbol 那个键代表「取不到键」，字符串键一律是业务值（哪怕它正好叫 unknown）。
  const isMissing = key === MISSING_GROUP_KEY;
  const created = createGroup(isMissing ? UNKNOWN_KEY : key, isMissing, false, bucketCount);
  groups.set(key, created);
  return created;
}

/** 组内按 id 去重地记一个任务 */
export function addTask(group: Group, taskId: string): void {
  if (group.seenTasks.has(taskId)) {
    return;
  }
  group.seenTasks.add(taskId);
  group.taskCount += 1;
}

/**
 * 按权重取前 STATS_TOP_N 名，其余合并成「其他」（key 为空字符串、isOther 为 true）。
 * 排序和「其他」的合成规则在 mergeTopN 里，这里只负责把累加器接上去。
 */
export function rankGroups(
  groups: Iterable<Group>,
  weight: (group: Group) => number,
  bucketCount: number,
): Group[] {
  return mergeTopN([...groups], STATS_TOP_N, weight, (rest) =>
    mergeGroups(rest, OTHER_KEY, bucketCount),
  );
}

function createGroup(
  key: string,
  isMissing: boolean,
  isOther: boolean,
  bucketCount: number,
): Group {
  return {
    key,
    isMissing,
    isOther,
    seenTasks: new Set<string>(),
    taskCount: 0,
    tokens: 0,
    runMs: 0,
    points: new Array<number>(bucketCount).fill(0),
  };
}

/** 把落选的分组并成「其他」：tasks 直接相加（不去重），tokens / runMs / 趋势按段相加 */
function mergeGroups(rest: readonly Group[], key: string, bucketCount: number): Group {
  const merged = createGroup(key, false, true, bucketCount);
  for (const group of rest) {
    merged.taskCount += group.taskCount;
    merged.tokens += group.tokens;
    merged.runMs += group.runMs;
    merged.points = merged.points.map((value, index) => value + (group.points[index] ?? 0));
  }
  return merged;
}
