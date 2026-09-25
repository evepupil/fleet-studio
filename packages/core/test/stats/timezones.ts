import type { TimeZone } from "../../src/stats/index.js";

/** 固定偏移的假时区（东八区用 480） */
export function fixedTimeZone(offsetMinutes: number): TimeZone {
  return { offsetMinutes: () => offsetMinutes };
}

/**
 * 偏移会变的假时区：在 transitionUtcMs 之前是 beforeMinutes，到点之后变成 afterMinutes。
 * 用来验证跨夏令时那天的对齐（本地日只有 23 小时）。
 */
export function switchingTimeZone(
  transitionUtcMs: number,
  beforeMinutes: number,
  afterMinutes: number,
): TimeZone {
  return {
    offsetMinutes: (utcMs) => (utcMs < transitionUtcMs ? beforeMinutes : afterMinutes),
  };
}
