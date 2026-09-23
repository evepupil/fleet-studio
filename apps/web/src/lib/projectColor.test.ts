import { describe, expect, it } from "vitest";
import { projectColorVar } from "./projectColor";

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

  it("负数取模仍落在 0~7", () => {
    expect(projectColorVar(-1)).toBe("var(--proj-7)");
    expect(projectColorVar(-8)).toBe("var(--proj-0)");
    expect(projectColorVar(-9)).toBe("var(--proj-7)");
  });
});
