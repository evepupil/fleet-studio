import type { StatsGranularity } from "../api/dto.js";
import { addLocalDays, startOfLocalDay, startOfLocalHour, startOfLocalWeek } from "./localTime.js";
import type { TimeZone } from "./types.js";

/**
 * 分段：把 [fromMs, toMs) 按本地时间对齐切成等长的段，返回每段的起点。
 * 段与段之间用「本地日期加 1 天 / 7 天再取零点」推进，跨夏令时不会漂移。
 */

/** 安全上限：避免极端输入（比如 fromMs 是 1970 年）生成几百万个分段把内存打满 */
const MAX_BUCKETS = 20_000;

/** 各粒度下取段起点的方式 */
const ALIGNERS: Readonly<Record<StatsGranularity, (ms: number, tz: TimeZone) => number>> = {
  hour: startOfLocalHour,
  day: startOfLocalDay,
  week: startOfLocalWeek,
};

/** 某一粒度的下一段起点 */
function nextBucketStart(startMs: number, granularity: StatsGranularity, tz: TimeZone): number {
  if (granularity === "hour") {
    return startMs + 3_600_000;
  }
  return addLocalDays(startMs, granularity === "day" ? 1 : 7, tz);
}

/**
 * 从 `fromMs` 所在分段的起点开始，逐段往后直到起点 ≥ toMs，返回各段起点（UTC 毫秒，升序）。
 * `fromMs ≥ toMs` 时没有分段，返回空数组。
 */
export function buildBuckets(
  fromMs: number,
  toMs: number,
  granularity: StatsGranularity,
  tz: TimeZone,
): number[] {
  if (fromMs >= toMs) {
    return [];
  }

  const align = ALIGNERS[granularity];
  const buckets: number[] = [];
  let cursor = align(fromMs, tz);
  while (cursor < toMs && buckets.length < MAX_BUCKETS) {
    buckets.push(cursor);
    const next = nextBucketStart(cursor, granularity, tz);
    // 理论上不会发生（每次推进至少一小时）；真出现了就停手，不写出死循环。
    if (next <= cursor) {
      break;
    }
    cursor = next;
  }
  return buckets;
}

/**
 * 最后一个起点 ≤ ms 的下标；早于第一个起点返回 −1。
 * 用二分：分段最多两万个，统计里每条事实都要查一次，线性扫不划算。
 */
export function bucketIndexOf(ms: number, buckets: readonly number[]): number {
  let low = 0;
  let high = buckets.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const value = buckets[mid];
    if (value === undefined) {
      break;
    }
    if (value <= ms) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
