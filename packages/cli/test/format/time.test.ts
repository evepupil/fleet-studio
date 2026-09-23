import { describe, expect, it } from "vitest";
import { formatClock, formatTimeOnly } from "../../src/format/time.js";

// 用本地时间的构造函数（年,月0起,日,时,分,秒）而不是写死的 UTC 字符串：
// 这样断言在任何时区跑都成立，不依赖测试机器恰好是哪个时区。
function localIso(
  year: number,
  month1to12: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string {
  return new Date(year, month1to12 - 1, day, hour, minute, second).toISOString();
}

describe("formatTimeOnly", () => {
  it("只输出时:分:秒，两位补零", () => {
    expect(formatTimeOnly(localIso(2026, 9, 23, 9, 5, 3))).toBe("09:05:03");
  });
});

describe("formatClock", () => {
  it("同一天只显示时:分:秒", () => {
    const now = new Date(2026, 8, 23, 18, 0, 0);
    const at = localIso(2026, 9, 23, 9, 5, 3);
    expect(formatClock(at, now)).toBe("09:05:03");
  });

  it("不是今天时前面加 月-日", () => {
    const now = new Date(2026, 8, 23, 10, 0, 0);
    const at = localIso(2026, 9, 20, 9, 5, 3);
    expect(formatClock(at, now)).toBe("09-20 09:05");
  });
});
