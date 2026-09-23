import { describe, expect, it } from "vitest";
import { createPiReducer } from "../../../src/runtimes/pi/reducer.js";
import { feedLines } from "./factories.js";

describe("pi reducer：认识但不展示的事件", () => {
  it.each([
    "turn_start",
    "turn_end",
    "message_start",
    "agent_end",
    "auto_retry_end",
    "tool_execution_start",
    "tool_execution_update",
    "tool_execution_end",
    "entry_appended",
    "compaction_start",
    "model_change",
    "thinking_level_change",
  ])("%s 不产出任何事件", (type) => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, [JSON.stringify({ type })]);
    expect(drafts).toEqual([]);
  });

  it("message_update（流式增量）不产出事件，即便带着 assistantMessageEvent", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, [
      JSON.stringify({
        type: "message_update",
        usage: {},
        assistantMessageEvent: { type: "text_delta", delta: "x" },
      }),
    ]);
    expect(drafts).toEqual([]);
  });

  it("完全不认识的未来事件类型：不产出事件，也不算错误", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, [JSON.stringify({ type: "some_future_event", x: 1 })]);
    expect(drafts).toEqual([]);
    expect(reducer.progress().plainOutputTail).toBeNull();
  });

  it("turn_end 携带的助手消息不会被重复处理（否则用量/活动会翻倍）", () => {
    const reducer = createPiReducer();
    const message = {
      role: "assistant",
      content: [{ type: "toolCall", id: "call_1", name: "bash", arguments: { command: "ls" } }],
      provider: "mcgrox",
      model: "deepseek-v4.1-flash",
      usage: {
        input: 10,
        output: 5,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 15,
        cost: { total: 0 },
      },
      stopReason: "toolUse",
    };
    feedLines(reducer, [JSON.stringify({ type: "message_end", message })]);
    feedLines(reducer, [JSON.stringify({ type: "turn_end", message, toolResults: [] })]);

    const progress = reducer.progress();
    expect(progress.usage.inputTokens).toBe(10);
    expect(progress.usage.outputTokens).toBe(5);
    expect(progress.activity).toBe("bash · ls");
  });
});
