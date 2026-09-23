import { describe, expect, it } from "vitest";
import { elapsedMs, formatDuration } from "../../src/format/duration.js";

describe("formatDuration", () => {
  it("不足 1 分钟显示秒", () => {
    expect(formatDuration(45_000)).toBe("45秒");
    expect(formatDuration(0)).toBe("0秒");
  });

  it("刚好 1 分钟进入分秒格式，秒数补零到两位", () => {
    expect(formatDuration(60_000)).toBe("1分00秒");
  });

  it("不足 1 小时显示分秒，秒数补零到两位（缺陷 9：与看板 formatDuration 对齐）", () => {
    expect(formatDuration(3 * 60_000 + 12_000)).toBe("3分12秒");
    expect(formatDuration(5 * 60_000 + 7_000)).toBe("5分07秒");
  });

  it("1 小时及以上显示时分，分钟补零到两位", () => {
    expect(formatDuration(60 * 60_000 + 5 * 60_000)).toBe("1时05分");
  });

  it("负数按 0 处理，不出现负时长", () => {
    expect(formatDuration(-100)).toBe("0秒");
  });
});

describe("elapsedMs", () => {
  const now = new Date("2026-09-23T10:00:00.000Z");

  it("已开始且已结束：用开始到结束的时间差", () => {
    const ms = elapsedMs(
      {
        queuedAt: "2026-09-23T09:00:00.000Z",
        startedAt: "2026-09-23T09:50:00.000Z",
        endedAt: "2026-09-23T09:53:12.000Z",
      },
      now,
    );
    expect(ms).toBe(3 * 60_000 + 12_000);
  });

  it("已开始未结束：用开始到 now 的时间差", () => {
    const ms = elapsedMs(
      {
        queuedAt: "2026-09-23T09:00:00.000Z",
        startedAt: "2026-09-23T09:59:00.000Z",
        endedAt: null,
      },
      now,
    );
    expect(ms).toBe(60_000);
  });

  it("还没开始：用排队时间到 now 的时间差", () => {
    const ms = elapsedMs(
      { queuedAt: "2026-09-23T09:59:30.000Z", startedAt: null, endedAt: null },
      now,
    );
    expect(ms).toBe(30_000);
  });
});
