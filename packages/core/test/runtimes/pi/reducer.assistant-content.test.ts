import { describe, expect, it } from "vitest";
import { createPiReducer } from "../../../src/runtimes/pi/reducer.js";
import { assistantMessageEndLine, feedLines } from "./factories.js";

describe("pi reducer：助手消息内容", () => {
  it("text 内容项去掉首尾空白后产出 text 事件，并成为 finalText", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, [
      assistantMessageEndLine({
        content: [{ type: "text", text: "  完成了  " }],
        stopReason: "stop",
      }),
    ]);
    expect(drafts).toEqual([{ kind: "text", at: expect.any(String), text: "完成了" }]);
    expect(reducer.progress().finalText).toBe("完成了");
  });

  it("纯空白的 text 内容项不产出事件，也不覆盖 finalText", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [
      assistantMessageEndLine({ content: [{ type: "text", text: "先前的结论" }] }),
    ]);
    const drafts = feedLines(reducer, [
      assistantMessageEndLine({ content: [{ type: "text", text: "   " }] }),
    ]);
    expect(drafts).toEqual([]);
    expect(reducer.progress().finalText).toBe("先前的结论");
  });

  it("多个 text 内容项用两个换行连接成 finalText", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [
      assistantMessageEndLine({
        content: [
          { type: "text", text: "第一段" },
          { type: "text", text: "第二段" },
        ],
      }),
    ]);
    expect(reducer.progress().finalText).toBe("第一段\n\n第二段");
  });

  it("thinking 内容项产出 thinking 事件", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, [
      assistantMessageEndLine({ content: [{ type: "thinking", thinking: "先想一想" }] }),
    ]);
    expect(drafts).toEqual([{ kind: "thinking", at: expect.any(String), text: "先想一想" }]);
  });

  it("toolCall 内容项产出 tool_call 事件并更新 activity", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, [
      assistantMessageEndLine({
        content: [{ type: "toolCall", id: "call_9", name: "read", arguments: { path: "a.ts" } }],
        stopReason: "toolUse",
      }),
    ]);
    expect(drafts).toEqual([
      {
        kind: "tool_call",
        at: expect.any(String),
        callId: "call_9",
        tool: "read",
        summary: "a.ts",
        detail: '{\n  "path": "a.ts"\n}',
      },
    ]);
    expect(reducer.progress().activity).toBe("read · a.ts");
  });

  it("toolCall 参数是空对象时 detail 为 null，摘要退回参数 JSON", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, [
      assistantMessageEndLine({
        content: [{ type: "toolCall", id: "call_9", name: "noop", arguments: {} }],
        stopReason: "toolUse",
      }),
    ]);
    expect(drafts).toEqual([
      {
        kind: "tool_call",
        at: expect.any(String),
        callId: "call_9",
        tool: "noop",
        summary: "{}",
        detail: null,
      },
    ]);
  });

  it("按内容顺序产出：先 thinking 再 toolCall", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, [
      assistantMessageEndLine({
        content: [
          { type: "thinking", thinking: "想一下" },
          { type: "toolCall", id: "call_1", name: "bash", arguments: { command: "ls" } },
        ],
        stopReason: "toolUse",
      }),
    ]);
    expect(drafts.map((draft) => draft.kind)).toEqual(["thinking", "tool_call"]);
  });

  it("provider/model 都存在时更新 progress().model", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [
      assistantMessageEndLine({ provider: "mcgrox", model: "deepseek-v4.1-flash" }),
    ]);
    expect(reducer.progress().model).toBe("mcgrox/deepseek-v4.1-flash");
  });
});
