import { describe, expect, it } from "vitest";
import { createPiReducer } from "../../../src/runtimes/pi/reducer.js";
import { feedLines } from "./factories.js";

function assistantLineWithUsage(usage: Record<string, unknown>): string {
  return JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [],
      stopReason: "toolUse",
      usage,
      timestamp: 1_700_000_000_000,
    },
  });
}

describe("pi reducer：用量累加（模块设计第 3、4.4 节）", () => {
  it("两条消息的用量按字段各自累加", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [
      assistantLineWithUsage({
        input: 960,
        output: 59,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1019,
        cost: { total: 0 },
      }),
      assistantLineWithUsage({
        input: 304,
        output: 2,
        cacheRead: 764,
        cacheWrite: 0,
        totalTokens: 1070,
        cost: { total: 0 },
      }),
    ]);
    expect(reducer.progress().usage).toEqual({
      inputTokens: 1264,
      outputTokens: 61,
      cacheReadTokens: 764,
      cacheWriteTokens: 0,
      totalTokens: 2089,
      costUsd: 0,
    });
  });

  it("数字字段不是有限数时按 0 处理", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [
      assistantLineWithUsage({
        input: Number.NaN,
        output: "5",
        cacheRead: null,
        cacheWrite: undefined,
      }),
    ]);
    expect(reducer.progress().usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      costUsd: null,
    });
  });

  it("totalTokens 缺省时按前四项之和", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [
      assistantLineWithUsage({ input: 10, output: 5, cacheRead: 3, cacheWrite: 2 }),
    ]);
    expect(reducer.progress().usage.totalTokens).toBe(20);
  });

  it("usage 整个字段缺失时不报错，按全零处理", () => {
    const reducer = createPiReducer();
    const line = JSON.stringify({
      type: "message_end",
      message: { role: "assistant", content: [], stopReason: "toolUse" },
    });
    expect(() => feedLines(reducer, [line])).not.toThrow();
    expect(reducer.progress().usage.totalTokens).toBe(0);
  });

  it("cost.total 不是有限数时费用保持原值（初值 null），不会被写成 0", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [assistantLineWithUsage({ cost: { total: "免费" } })]);
    expect(reducer.progress().usage.costUsd).toBeNull();
  });

  it("费用一旦出现过有效数字，后续没有费用信息的消息不会把它冲掉", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [assistantLineWithUsage({ cost: { total: 0.05 } })]);
    expect(reducer.progress().usage.costUsd).toBe(0.05);
    feedLines(reducer, [assistantLineWithUsage({})]);
    expect(reducer.progress().usage.costUsd).toBe(0.05);
  });

  it("费用累加：两条都有有效费用时相加", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [
      assistantLineWithUsage({ cost: { total: 0.05 } }),
      assistantLineWithUsage({ cost: { total: 0.02 } }),
    ]);
    expect(reducer.progress().usage.costUsd).toBeCloseTo(0.07);
  });
});
