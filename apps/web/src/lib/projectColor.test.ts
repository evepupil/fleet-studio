import { describe, expect, it } from "vitest";
import { projectColorVar, seriesColorVar } from "./colors";

describe("projectColorVar", () => {
  it("0~7 原样落到对应变量", () => {
    expect(projectColorVar(0)).toBe("var(--proj-0)");
    expect(projectColorVar(7)).toBe("var(--proj-7)");
  });

  it("大于 7 取模", () => {
    expect(projectColorVar(8)).toBe("var(--proj-0)");
    expect(projectColorVar(9)).toBe("var(--proj-1)");
    expect(projectColorVar(23)).toBe("var(--proj-7)");
  });

  it("null 使用其他系列的颜色", () => {
    expect(seriesColorVar(null)).toBe("var(--series-other)");
  });

  it("非空索引按 8 个 token 取模", () => {
    expect(seriesColorVar(0)).toBe("var(--series-0)");
    expect(seriesColorVar(7)).toBe("var(--series-7)");
    expect(seriesColorVar(8)).toBe("var(--series-0)");
    expect(seriesColorVar(-1)).toBe("var(--series-7)");
  });
});
