import type { TimeZone } from "@fleet/core";

/** 系统本地时区的偏移按被查询的时刻计算，以正确处理夏令时切换。 */
export const systemTimeZone: TimeZone = {
  offsetMinutes(utcMs: number): number {
    return -new Date(utcMs).getTimezoneOffset();
  },
};
