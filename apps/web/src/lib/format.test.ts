import { describe, expect, it } from "vitest";
import {
  elapsedMs,
  formatClock,
  formatCost,
  formatDuration,
  formatShortDuration,
  formatTokens,
  middleEllipsis,
} from "./format";

describe("formatDuration", () => {
  it("60 秒以内只写秒", () => {
    expect(formatDuration(0)).toBe("0秒");
    expect(formatDuration(45_000)).toBe("45秒");
    expect(formatDuration(59_000)).toBe("59秒");
  });

  it("负数按 0 处理", () => {
    expect(formatDuration(-5000)).toBe("0秒");
  });

  it("1 小时以内写分秒，秒补零", () => {
    expect(formatDuration(60_000)).toBe("1分00秒");
    expect(formatDuration(192_000)).toBe("3分12秒");
    expect(formatDuration(3_599_000)).toBe("59分59秒");
  });

  it("1 小时及以上写时分，分补零", () => {
    expect(formatDuration(3_600_000)).toBe("1时00分");
    expect(formatDuration(3_900_000)).toBe("1时05分");
    expect(formatDuration(45_000_000)).toBe("12时30分");
  });
});

describe("formatShortDuration", () => {
  it("10 秒以内保留一位小数", () => {
    expect(formatShortDuration(2_100)).toBe("2.1秒");
    expect(formatShortDuration(0)).toBe("0.0秒");
  });

  it("10 秒到 60 秒之间同 formatDuration 的整数秒", () => {
    expect(formatShortDuration(45_000)).toBe("45秒");
    expect(formatShortDuration(10_000)).toBe("10秒");
  });

  it("60 秒及以上同 formatDuration", () => {
    expect(formatShortDuration(192_000)).toBe("3分12秒");
  });
});

describe("formatClock", () => {
  it("和 now 同一天只显示时分秒", () => {
    const now = new Date(2026, 8, 23, 12, 10, 0);
    const at = new Date(2026, 8, 23, 9, 3, 4);
    expect(formatClock(at.toISOString(), now.getTime())).toBe("09:03:04");
  });

  it("跨天时补上月日", () => {
    const now = new Date(2026, 8, 23, 0, 5, 0);
    const at = new Date(2026, 8, 22, 23, 58, 0);
    expect(formatClock(at.toISOString(), now.getTime())).toBe("09-22 23:58");
  });
});

describe("formatTokens", () => {
  it("千位以下原样", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
  });

  it("千位用 K，去掉多余的 .0", () => {
    expect(formatTokens(1000)).toBe("1K");
    expect(formatTokens(4200)).toBe("4.2K");
    expect(formatTokens(999_500)).toBe("999.5K");
  });

  it("四舍五入进位不会提前跳到百万分支", () => {
    expect(formatTokens(999_950)).toBe("1000K");
  });

  it("百万位用 M", () => {
    expect(formatTokens(1_000_000)).toBe("1M");
    expect(formatTokens(1_340_000)).toBe("1.3M");
  });
});

describe("formatCost", () => {
  it("null 或 0 不显示", () => {
    expect(formatCost(null)).toBeNull();
    expect(formatCost(0)).toBeNull();
  });

  it("小于 1 分钱写 <$0.01", () => {
    expect(formatCost(0.004)).toBe("<$0.01");
    expect(formatCost(0.0099)).toBe("<$0.01");
  });

  it("其余按两位小数显示", () => {
    expect(formatCost(0.01)).toBe("$0.01");
    expect(formatCost(0.84)).toBe("$0.84");
  });
});

describe("middleEllipsis", () => {
  it("没超过上限原样返回", () => {
    expect(middleEllipsis("abc", 10)).toBe("abc");
  });

  it("超过上限从中间省略，结果长度恰好是 max", () => {
    const result = middleEllipsis("C:\\code\\wiki-forge\\packages\\core\\src\\index.ts", 20);
    expect(result).toHaveLength(20);
    expect(result.startsWith("C:\\code")).toBe(true);
    expect(result.includes("…")).toBe(true);
  });
});

describe("elapsedMs", () => {
  it("起点为空时无法计算", () => {
    expect(elapsedMs(null, null, Date.now())).toBeNull();
  });

  it("终点为空按 now 计算实时耗时", () => {
    const from = new Date(2026, 8, 23, 12, 0, 0);
    const now = new Date(2026, 8, 23, 12, 0, 30);
    expect(elapsedMs(from.toISOString(), null, now.getTime())).toBe(30_000);
  });

  it("终点存在按终点计算，忽略 now", () => {
    const from = new Date(2026, 8, 23, 12, 0, 0);
    const to = new Date(2026, 8, 23, 12, 1, 0);
    expect(elapsedMs(from.toISOString(), to.toISOString(), Date.now())).toBe(60_000);
  });
});
