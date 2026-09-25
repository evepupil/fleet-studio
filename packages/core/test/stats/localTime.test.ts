import { describe, expect, it } from "vitest";
import { isFleetError } from "../../src/domain/errors.js";
import {
  addLocalDays,
  localDateToUtcMs,
  startOfLocalDay,
  startOfLocalHour,
  startOfLocalWeek,
} from "../../src/stats/index.js";
import { fixedTimeZone, switchingTimeZone } from "./timezones.js";

const TZ_8 = fixedTimeZone(480);

/** 东八区本地 2026-09-25 14:30 = UTC 06:30 */
const AFTERNOON_UTC = Date.parse("2026-09-25T06:30:00Z");

describe("startOfLocalDay", () => {
  it("东八区的下午落在当天本地零点（UTC 前一天 16:00）", () => {
    expect(startOfLocalDay(AFTERNOON_UTC, TZ_8)).toBe(Date.parse("2026-09-24T16:00:00Z"));
  });

  it("本地零点这一刻本身就是起点", () => {
    const midnight = Date.parse("2026-09-24T16:00:00Z");
    expect(startOfLocalDay(midnight, TZ_8)).toBe(midnight);
  });

  it("本地 00:00 前 1 毫秒还属于前一天", () => {
    const beforeMidnight = Date.parse("2026-09-24T16:00:00Z") - 1;
    expect(startOfLocalDay(beforeMidnight, TZ_8)).toBe(Date.parse("2026-09-23T16:00:00Z"));
  });

  it("跨夏令时那天（本地日 23 小时）的零点按当时的偏移算", () => {
    // 2026-09-25T02:00Z 之前 +60，之后 +120：本地日 2026-09-25 只有 23 小时，
    // 从 2026-09-24T23:00Z（本地 00:00）到 2026-09-25T22:00Z（次日本地 00:00）。
    const tz = switchingTimeZone(Date.parse("2026-09-25T02:00:00Z"), 60, 120);
    const noon = Date.parse("2026-09-25T10:00:00Z");
    expect(startOfLocalDay(noon, tz)).toBe(Date.parse("2026-09-24T23:00:00Z"));
    // 次日零点用切换后的 +120：本地 2026-09-26 00:00 = UTC 2026-09-25T22:00
    expect(addLocalDays(noon, 1, tz)).toBe(Date.parse("2026-09-25T22:00:00Z"));
    // 相邻两个零点之间正好 23 小时，不是 24
    expect(addLocalDays(noon, 1, tz) - startOfLocalDay(noon, tz)).toBe(23 * 3_600_000);
  });
});

describe("startOfLocalHour", () => {
  it("东八区的 14:30 归到本地 14:00（UTC 06:00）", () => {
    expect(startOfLocalHour(AFTERNOON_UTC, TZ_8)).toBe(Date.parse("2026-09-25T06:00:00Z"));
  });

  it("整点这一刻本身就是起点", () => {
    const hour = Date.parse("2026-09-25T06:00:00Z");
    expect(startOfLocalHour(hour, TZ_8)).toBe(hour);
  });

  it("整点前 1 毫秒归到上一个整点", () => {
    expect(startOfLocalHour(Date.parse("2026-09-25T06:00:00Z") - 1, TZ_8)).toBe(
      Date.parse("2026-09-25T05:00:00Z"),
    );
  });

  it("夏令时回拨：同一个本地钟点出现两次时取回拨前（更早）的那次", () => {
    // 欧洲式回拨：2026-10-25T01:00Z 之前 +120，之后 +60。
    // 本地 02:30 出现两次：第一次是 UTC 00:30（+120），第二次是 UTC 01:30（+60）。
    const tz = switchingTimeZone(Date.parse("2026-10-25T01:00:00Z"), 120, 60);
    const firstOccurrence = Date.parse("2026-10-25T00:30:00Z"); // 本地 02:30（+120）
    // 整点必须是本地 02:00 的第一次出现（UTC 00:00），不能落到 01:00Z（那次是未来）。
    expect(startOfLocalHour(firstOccurrence, tz)).toBe(Date.parse("2026-10-25T00:00:00Z"));
    // 第二次出现（UTC 01:30，本地 02:30 +60）是另一个本地 02:00（UTC 01:00），
    // 它不晚于输入，也是合法答案。
    expect(startOfLocalHour(Date.parse("2026-10-25T01:30:00Z"), tz)).toBe(
      Date.parse("2026-10-25T01:00:00Z"),
    );
    // 回拨后进入本地 03:xx（UTC 02:30 +60）才归到 02:00Z 那个整点。
    expect(startOfLocalHour(Date.parse("2026-10-25T02:30:00Z"), tz)).toBe(
      Date.parse("2026-10-25T02:00:00Z"),
    );
  });

  it("对齐结果永远不晚于输入（回拨那天逐小时扫一遍）", () => {
    const tz = switchingTimeZone(Date.parse("2026-10-25T01:00:00Z"), 120, 60);
    // 从回拨前两小时扫到回拨后两小时，每分钟一个点：整点对齐不能跑到输入之后。
    for (let ms = Date.parse("2026-10-24T23:00:00Z"); ms <= Date.parse("2026-10-25T03:00:00Z"); ) {
      const aligned = startOfLocalHour(ms, tz);
      expect(aligned).toBeLessThanOrEqual(ms);
      expect(ms - aligned).toBeLessThan(3_600_000);
      ms += 60_000;
    }
  });
});

describe("startOfLocalWeek", () => {
  it("东八区的周五归到本周一本地零点", () => {
    // 本地 2026-09-25 是周五，本周一是本地 2026-09-21 00:00 = UTC 2026-09-20T16:00
    expect(startOfLocalWeek(AFTERNOON_UTC, TZ_8)).toBe(Date.parse("2026-09-20T16:00:00Z"));
  });

  it("周一当天就是本段的起点", () => {
    const monday = Date.parse("2026-09-20T16:00:00Z");
    expect(startOfLocalWeek(monday, TZ_8)).toBe(monday);
  });

  it("周日归到上一个周一（不是当天）", () => {
    // 本地 2026-09-27 是周日，周一仍是 2026-09-21
    const sunday = Date.parse("2026-09-27T04:00:00Z");
    expect(startOfLocalWeek(sunday, TZ_8)).toBe(Date.parse("2026-09-20T16:00:00Z"));
  });

  it("跨夏令时那周的周一用切换前的偏移", () => {
    const tz = switchingTimeZone(Date.parse("2026-09-25T02:00:00Z"), 60, 120);
    const noon = Date.parse("2026-09-25T10:00:00Z");
    // 本地 2026-09-25 是周五，周一本地 2026-09-21 00:00 在切换前，偏移 +60
    expect(startOfLocalWeek(noon, tz)).toBe(Date.parse("2026-09-20T23:00:00Z"));
  });
});

describe("localDateToUtcMs", () => {
  it("东八区某天的本地零点", () => {
    expect(localDateToUtcMs("2026-09-25", TZ_8)).toBe(Date.parse("2026-09-24T16:00:00Z"));
  });

  it("偏移会变时用那天本地零点的偏移", () => {
    const tz = switchingTimeZone(Date.parse("2026-09-25T02:00:00Z"), 60, 120);
    // 2026-09-25 本地 00:00 在切换前（+60）
    expect(localDateToUtcMs("2026-09-25", tz)).toBe(Date.parse("2026-09-24T23:00:00Z"));
    // 2026-09-26 本地 00:00 在切换后（+120）
    expect(localDateToUtcMs("2026-09-26", tz)).toBe(Date.parse("2026-09-25T22:00:00Z"));
  });

  it("格式不对抛 FleetError", () => {
    for (const bad of ["2026/09/25", "20260925", "2026-9-25", "abc", ""]) {
      expect(() => localDateToUtcMs(bad, TZ_8)).toThrowError(/日期格式应为 YYYY-MM-DD/);
      try {
        localDateToUtcMs(bad, TZ_8);
      } catch (error) {
        expect(isFleetError(error) && error.code).toBe("invalid_request");
      }
    }
  });

  it("格式对但日期不存在也抛错", () => {
    expect(() => localDateToUtcMs("2026-02-31", TZ_8)).toThrowError(/日期格式应为 YYYY-MM-DD/);
  });
});

describe("addLocalDays", () => {
  it("按本地日期加减，跨月跨年都对", () => {
    const newYear = Date.parse("2025-12-31T16:00:00Z"); // 本地 2026-01-01 00:00
    expect(addLocalDays(newYear, -1, TZ_8)).toBe(Date.parse("2025-12-30T16:00:00Z"));
    expect(addLocalDays(newYear, 31, TZ_8)).toBe(Date.parse("2026-01-31T16:00:00Z"));
  });
});
