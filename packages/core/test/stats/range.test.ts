import { describe, expect, it } from "vitest";
import { isFleetError } from "../../src/domain/errors.js";
import { chooseGranularity, localDateToUtcMs, resolveRange } from "../../src/stats/index.js";
import { fixedTimeZone, switchingTimeZone } from "./timezones.js";

const TZ_8 = fixedTimeZone(480);

/** 东八区本地 2026-09-25 14:30 = UTC 06:30 */
const NOW = Date.parse("2026-09-25T06:30:00Z");
const TODAY_START = Date.parse("2026-09-24T16:00:00Z");

describe("resolveRange", () => {
  it("today：今天本地零点到当前时刻", () => {
    expect(resolveRange({ kind: "today" }, NOW, TZ_8)).toEqual({
      fromMs: TODAY_START,
      toMs: NOW,
    });
  });

  it("7d：往前 6 天，含今天共 7 个本地日期", () => {
    const resolved = resolveRange({ kind: "7d" }, NOW, TZ_8);
    expect(resolved.fromMs).toBe(Date.parse("2026-09-18T16:00:00Z"));
    expect(resolved.toMs).toBe(NOW);
    const days = (TODAY_START - (resolved.fromMs ?? 0)) / 86_400_000 + 1;
    expect(days).toBe(7);
  });

  it("30d：往前 29 天", () => {
    const resolved = resolveRange({ kind: "30d" }, NOW, TZ_8);
    expect(resolved.fromMs).toBe(Date.parse("2026-08-26T16:00:00Z"));
    expect((TODAY_START - (resolved.fromMs ?? 0)) / 86_400_000 + 1).toBe(30);
  });

  it("all：没有下限，终点是当前时刻", () => {
    expect(resolveRange({ kind: "all" }, NOW, TZ_8)).toEqual({ fromMs: null, toMs: NOW });
  });

  it("custom：from 那天本地零点到 to 次日零点（更晚时取 now）", () => {
    const resolved = resolveRange(
      { kind: "custom", from: "2026-09-01", to: "2026-09-10" },
      NOW,
      TZ_8,
    );
    expect(resolved.fromMs).toBe(Date.parse("2026-08-31T16:00:00Z"));
    expect(resolved.toMs).toBe(Date.parse("2026-09-10T16:00:00Z"));
  });

  it("custom 的 to 是今天时终点为 nowMs（不是次日零点）", () => {
    const resolved = resolveRange(
      { kind: "custom", from: "2026-09-20", to: "2026-09-25" },
      NOW,
      TZ_8,
    );
    expect(resolved.toMs).toBe(NOW);
  });

  it("custom 的 to 是未来日期时终点也是 nowMs", () => {
    const resolved = resolveRange(
      { kind: "custom", from: "2026-09-20", to: "2026-12-31" },
      NOW,
      TZ_8,
    );
    expect(resolved.toMs).toBe(NOW);
  });

  it("custom 缺 from 或 to 抛 FleetError", () => {
    for (const request of [
      { kind: "custom" as const },
      { kind: "custom" as const, from: "2026-09-01" },
      { kind: "custom" as const, to: "2026-09-01" },
    ]) {
      expect(() => resolveRange(request, NOW, TZ_8)).toThrowError(/自选日期要同时给出 from 和 to/);
      try {
        resolveRange(request, NOW, TZ_8);
      } catch (error) {
        expect(isFleetError(error) && error.code).toBe("invalid_request");
      }
    }
  });

  it("custom 的日期格式不对也抛 invalid_request", () => {
    expect(() =>
      resolveRange({ kind: "custom", from: "x", to: "2026-09-10" }, NOW, TZ_8),
    ).toThrowError(/日期格式应为 YYYY-MM-DD/);
  });

  it("7d 的起点用「本地日期减 6 天」，跨夏令时不是减 144 小时", () => {
    // 本地日 2026-09-25 只有 23 小时：切换前 +60，之后 +120。
    const tz = switchingTimeZone(Date.parse("2026-09-25T02:00:00Z"), 60, 120);
    const now = Date.parse("2026-09-25T10:00:00Z");
    const resolved = resolveRange({ kind: "7d" }, now, tz);
    // 本地 2026-09-25 00:00（+60）→ 本地 2026-09-19 00:00（+60）
    expect(resolved.fromMs).toBe(Date.parse("2026-09-18T23:00:00Z"));
    // 若按 now − 6×24h 算会得到 2026-09-18T22:00Z，正好差一小时
    expect(resolved.fromMs).not.toBe(now - 6 * 86_400_000);
  });
});

describe("chooseGranularity", () => {
  it("today 恒为 hour", () => {
    expect(chooseGranularity("today", null, NOW)).toBe("hour");
    expect(chooseGranularity("today", TODAY_START, NOW)).toBe("hour");
  });

  it("1 天为 hour", () => {
    expect(chooseGranularity("custom", NOW - 86_400_000, NOW)).toBe("hour");
  });

  it("正好 2 天为 hour", () => {
    expect(chooseGranularity("custom", NOW - 2 * 86_400_000, NOW)).toBe("hour");
  });

  it("2 天多 1 毫秒为 day", () => {
    expect(chooseGranularity("custom", NOW - 2 * 86_400_000 - 1, NOW)).toBe("day");
  });

  it("正好 90 天为 day", () => {
    expect(chooseGranularity("all", NOW - 90 * 86_400_000, NOW)).toBe("day");
  });

  it("91 天为 week", () => {
    expect(chooseGranularity("all", NOW - 91 * 86_400_000, NOW)).toBe("week");
  });

  it("起点为 null（没有数据）时按 hour", () => {
    expect(chooseGranularity("all", null, NOW)).toBe("hour");
  });

  it("7d、30d 分别是 day", () => {
    expect(chooseGranularity("7d", NOW - 7 * 86_400_000, NOW)).toBe("day");
    expect(chooseGranularity("30d", NOW - 30 * 86_400_000, NOW)).toBe("day");
  });
});

describe("localDateToUtcMs 与 resolveRange 的一致性", () => {
  it("custom 的 from 就是 localDateToUtcMs", () => {
    const resolved = resolveRange(
      { kind: "custom", from: "2026-09-01", to: "2026-09-02" },
      NOW,
      TZ_8,
    );
    expect(resolved.fromMs).toBe(localDateToUtcMs("2026-09-01", TZ_8));
  });
});
