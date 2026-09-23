import type { Usage } from "@fleet/core";
import { describe, expect, it } from "vitest";
import { formatUsage } from "../../src/format/usage.js";

describe("formatUsage", () => {
  it("费用已知时附加费用", () => {
    const usage: Usage = {
      inputTokens: 100,
      outputTokens: 200,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      totalTokens: 315,
      costUsd: 0.012345,
    };
    expect(formatUsage(usage)).toBe(
      "输入 100 · 输出 200 · 缓存读 10 · 缓存写 5 · 合计 315 · 费用 $0.0123",
    );
  });

  it("费用未知（null）时不显示费用部分", () => {
    const usage: Usage = {
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 3,
      costUsd: null,
    };
    expect(formatUsage(usage)).toBe("输入 1 · 输出 2 · 缓存读 0 · 缓存写 0 · 合计 3");
  });

  it("费用为 0 时也不显示费用部分（缺陷 6：不该显示成「费用 $0.0000」）", () => {
    const usage: Usage = {
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 3,
      costUsd: 0,
    };
    expect(formatUsage(usage)).toBe("输入 1 · 输出 2 · 缓存读 0 · 缓存写 0 · 合计 3");
  });
});
