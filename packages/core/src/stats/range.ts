import type { StatsGranularity } from "../api/dto.js";
import type { RangeKind } from "../api/requests.js";
import { FleetError } from "../domain/errors.js";
import { addLocalDays, localDateToUtcMs, startOfLocalDay } from "./localTime.js";
import type { RangeRequest, ResolvedRange, TimeZone } from "./types.js";

/**
 * 时间范围档位到毫秒区间的换算，以及分段粒度的选择。
 * 全部按调用方给的本地时区对齐；往前 N 天一律走「本地日期减 N 天再取零点」，
 * 不能用减 N×24 小时（跨夏令时会错一小时）。
 */

const MS_PER_DAY = 86_400_000;
/** chooseGranularity 的两条阈值：2 天以内按小时，90 天以内按天，更长按周 */
const HOUR_GRANULARITY_MAX_MS = 2 * MS_PER_DAY;
const DAY_GRANULARITY_MAX_MS = 90 * MS_PER_DAY;

/** 档位对应的天数（含今天）；custom、all 不走这张表 */
const RANGE_DAYS: Readonly<Partial<Record<RangeKind, number>>> = {
  today: 1,
  "7d": 7,
  "30d": 30,
};

/**
 * 把请求里的档位解析成毫秒区间。`toMs` 一律是 `nowMs`（custom 的次日零点更晚时也是 nowMs）。
 */
export function resolveRange(range: RangeRequest, nowMs: number, tz: TimeZone): ResolvedRange {
  const todayStart = startOfLocalDay(nowMs, tz);

  if (range.kind === "all") {
    return { fromMs: null, toMs: nowMs };
  }

  if (range.kind === "custom") {
    const { from, to } = range;
    if (from === undefined || to === undefined) {
      throw new FleetError("invalid_request", "自选日期要同时给出 from 和 to");
    }
    const fromMs = localDateToUtcMs(from, tz);
    const toDayStart = localDateToUtcMs(to, tz);
    return { fromMs, toMs: Math.min(addLocalDays(toDayStart, 1, tz), nowMs) };
  }

  const days = RANGE_DAYS[range.kind] ?? 1;
  return { fromMs: addLocalDays(todayStart, -(days - 1), tz), toMs: nowMs };
}

/**
 * 选分段粒度。today 恒为小时（一天最多 24 段）；其余档位看实际跨度。
 * 起点为 null（all 且没有数据）时按 nowMs 当起点，反正不会产生分段。
 */
export function chooseGranularity(
  kind: RangeKind,
  fromMs: number | null,
  toMs: number,
): StatsGranularity {
  if (kind === "today") {
    return "hour";
  }
  const spanMs = toMs - (fromMs ?? toMs);
  if (spanMs <= HOUR_GRANULARITY_MAX_MS) {
    return "hour";
  }
  if (spanMs <= DAY_GRANULARITY_MAX_MS) {
    return "day";
  }
  return "week";
}
