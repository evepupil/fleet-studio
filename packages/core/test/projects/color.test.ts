import { describe, expect, it } from "vitest";
import { PROJECT_PALETTE_SIZE, pickColorIndex } from "../../src/projects/color.js";

describe("pickColorIndex", () => {
  it("空调色板时选最小的空位 0", () => {
    expect(pickColorIndex([], "seed")).toBe(0);
  });

  it("跳过已占用的位置，选最小的空位", () => {
    expect(pickColorIndex([0, 1, 3], "seed")).toBe(2);
    expect(pickColorIndex([1, 2, 0], "seed")).toBe(3);
  });

  it("不关心 taken 里的重复和顺序，只关心集合", () => {
    expect(pickColorIndex([4, 4, 4, 0, 1, 2, 3], "seed")).toBe(5);
  });

  it("全部占满时用 seed 的 FNV-1a 哈希取模，结果和公式手算一致", () => {
    const taken = Array.from({ length: PROJECT_PALETTE_SIZE }, (_, i) => i);
    // FNV-1a 32 位偏移基数 0x811c9dc5 = 2166136261，空字符串没有字符参与运算，
    // 哈希就是偏移基数本身；2166136261 % 8 = 5，这个结果不依赖本模块的实现。
    expect(pickColorIndex(taken, "")).toBe(5);
  });

  it("全部占满时同一个 seed 结果稳定", () => {
    const taken = Array.from({ length: PROJECT_PALETTE_SIZE }, (_, i) => i);
    const first = pickColorIndex(taken, "C:\\code\\fleet-studio");
    const second = pickColorIndex(taken, "C:\\code\\fleet-studio");
    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(PROJECT_PALETTE_SIZE);
  });

  it("全部占满时不同 seed 通常落在不同格子（确认哈希真的参与了计算）", () => {
    const taken = Array.from({ length: PROJECT_PALETTE_SIZE }, (_, i) => i);
    const values = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((seed) => pickColorIndex(taken, seed)),
    );
    expect(values.size).toBeGreaterThan(1);
  });

  it("支持自定义 paletteSize", () => {
    expect(pickColorIndex([0], "seed", 2)).toBe(1);
    const result = pickColorIndex([0, 1], "seed", 2);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(2);
  });
});
