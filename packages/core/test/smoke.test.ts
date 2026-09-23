import { describe, expect, it } from "vitest";
import { addUsage, ZERO_USAGE } from "../src/index.js";

describe("addUsage", () => {
  it("两份用量相加，两边费用都为 null 时结果费用为 null", () => {
    const a = { ...ZERO_USAGE, inputTokens: 10, outputTokens: 5, totalTokens: 15 };
    const b = { ...ZERO_USAGE, inputTokens: 3, outputTokens: 2, totalTokens: 5 };

    const result = addUsage(a, b);

    expect(result).toEqual({
      inputTokens: 13,
      outputTokens: 7,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 20,
      costUsd: null,
    });
  });
});
