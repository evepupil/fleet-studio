import { FleetError } from "../domain/errors.js";
import type { TimeZone } from "./types.js";

/**
 * 本地时间的换算。核心层不读系统时区，偏移由调用方通过 TimeZone 提供：
 * 本地时刻 = UTC 毫秒 + offsetMinutes(该 UTC 时刻) × 60000。
 * 对齐一律在「本地时刻」上做，再换回 UTC 毫秒。
 */

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;
const DAYS_PER_WEEK = 7;
/** 本地日期字符串的位数，用来在正则之外先做一次快速排除 */
const LOCAL_DATE_LENGTH = 10;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 本地时刻（UTC 毫秒 + 该时刻的偏移） */
function toLocalMs(utcMs: number, tz: TimeZone): number {
  return utcMs + tz.offsetMinutes(utcMs) * MS_PER_MINUTE;
}

/**
 * 把本地时刻换回 UTC 毫秒。偏移随时刻变化（夏令时切换）时，用候选 UTC 时刻的偏移再迭代一次，
 * 让「切换前后那几小时」的对齐结果落在正确的偏移上。
 * 回拨那天同一个本地钟点会出现两次（两个 UTC 时刻），fromLocalMs 会选到后一个。
 * 传了 notAfterMs（对齐类调用的输入时刻）时结果必须不晚于它：晚于它就说明输入落在
 * 第一次出现的那个钟点里，改用输入自身的偏移重新换算；再不行退回第一次迭代的候选。
 * 不传时（没有「输入时刻」可比的日期换算）保持原来的行为。
 */
function fromLocalMs(localMs: number, tz: TimeZone, notAfterMs: number | null = null): number {
  const candidate = localMs - tz.offsetMinutes(localMs) * MS_PER_MINUTE;
  const resolved = localMs - tz.offsetMinutes(candidate) * MS_PER_MINUTE;
  if (notAfterMs === null || resolved <= notAfterMs) {
    return resolved;
  }
  const earlier = localMs - tz.offsetMinutes(notAfterMs) * MS_PER_MINUTE;
  return earlier <= notAfterMs ? earlier : candidate;
}

/** 这个时刻所在本地日期的零点（UTC 毫秒） */
export function startOfLocalDay(utcMs: number, tz: TimeZone): number {
  const localMs = toLocalMs(utcMs, tz);
  // Date 的 UTC 取值函数在这里只是「把毫秒数拆成日期各部分」的算术工具，不涉及任何时区。
  const localDate = new Date(localMs);
  const dayStartLocalMs = Date.UTC(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth(),
    localDate.getUTCDate(),
  );
  return fromLocalMs(dayStartLocalMs, tz, utcMs);
}

/** 所在本地整点（UTC 毫秒） */
export function startOfLocalHour(utcMs: number, tz: TimeZone): number {
  const localMs = toLocalMs(utcMs, tz);
  const hourStartLocalMs = Math.floor(localMs / MS_PER_HOUR) * MS_PER_HOUR;
  return fromLocalMs(hourStartLocalMs, tz, utcMs);
}

/**
 * 所在本地周的周一零点（UTC 毫秒）。
 * 从所在本地日期的零点起算，再按「本地日期减 N 天」的方式回退，避免减 N×24 小时在夏令时切换日错一小时。
 */
export function startOfLocalWeek(utcMs: number, tz: TimeZone): number {
  const dayStartLocalMs = toLocalMs(startOfLocalDay(utcMs, tz), tz);
  // getUTCDay：0 = 周日，1 = 周一 …… 6 = 周六
  const weekday = new Date(dayStartLocalMs).getUTCDay();
  const daysSinceMonday = (weekday + 6) % DAYS_PER_WEEK;
  if (daysSinceMonday === 0) {
    return fromLocalMs(dayStartLocalMs, tz, utcMs);
  }
  const mondayLocalMs = Date.UTC(
    new Date(dayStartLocalMs).getUTCFullYear(),
    new Date(dayStartLocalMs).getUTCMonth(),
    new Date(dayStartLocalMs).getUTCDate() - daysSinceMonday,
  );
  return fromLocalMs(mondayLocalMs, tz, utcMs);
}

/**
 * `YYYY-MM-DD` 那天本地零点（UTC 毫秒）。
 * 格式不对抛 invalid_request：调用方（服务层）只做粗校验，这里的报错信息才是给人看的。
 */
export function localDateToUtcMs(date: string, tz: TimeZone): number {
  if (date.length !== LOCAL_DATE_LENGTH || !LOCAL_DATE_PATTERN.test(date)) {
    throw new FleetError("invalid_request", `日期格式应为 YYYY-MM-DD：${date}`);
  }
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const utcMs = Date.UTC(year, month - 1, day);
  if (Number.isNaN(utcMs)) {
    throw new FleetError("invalid_request", `日期格式应为 YYYY-MM-DD：${date}`);
  }
  // Date.UTC 会把 2026-02-31 这类不存在的日期顺延成 3 月 3 日；回读一次各字段，
  // 对不上就说明这个日期不存在，按格式错误处理（否则会静默算到别的日子上）。
  const parsed = new Date(utcMs);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new FleetError("invalid_request", `日期格式应为 YYYY-MM-DD：${date}`);
  }
  // 日期只给到天，没有「输入时刻」可比：按原来的行为换算（回拨日的零点取后一次）。
  return fromLocalMs(utcMs, tz);
}

/** 本地日期加减天数后再取零点：跨夏令时不会错一小时（对齐在本地日期上做） */
export function addLocalDays(utcMs: number, days: number, tz: TimeZone): number {
  const dayStartLocalMs = toLocalMs(startOfLocalDay(utcMs, tz), tz);
  const shifted = new Date(dayStartLocalMs + days * MS_PER_DAY);
  const shiftedLocalMs = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return fromLocalMs(shiftedLocalMs, tz);
}
