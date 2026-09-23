import { describe, expect, it } from "vitest";
import { createPiReducer } from "../../../src/runtimes/pi/reducer.js";
import { assistantMessageEndLine, feedLines } from "./factories.js";

describe("pi reducer：工具结果消息", () => {
  it("isError:false 时 ok:true，预览拼接 content 里的文本项", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, [
      JSON.stringify({
        type: "message_end",
        message: {
          role: "toolResult",
          toolCallId: "call_1",
          toolName: "bash",
          content: [{ type: "text", text: "fleet-ok\n" }],
          isError: false,
          timestamp: 1_700_000_000_000,
        },
      }),
    ]);
    expect(drafts).toEqual([
      {
        kind: "tool_result",
        at: expect.any(String),
        callId: "call_1",
        tool: "bash",
        ok: true,
        preview: "fleet-ok\n",
        truncated: false,
      },
    ]);
  });

  it("isError:true 时 ok:false（数据取自真实样本 s09 里 ls 报错的那条工具结果）", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, [
      JSON.stringify({
        type: "message_end",
        message: {
          role: "toolResult",
          toolCallId: "call_00_C9yh9hDu6o6fFITuVO5V5480",
          toolName: "bash",
          content: [
            {
              type: "text",
              text: "ls: cannot access 'probe.txt': No such file or directory\n\n\nCommand exited with code 2",
            },
          ],
          details: {},
          isError: true,
          timestamp: 1_790_152_751_485,
        },
      }),
    ]);
    expect(drafts).toEqual([
      {
        kind: "tool_result",
        at: expect.any(String),
        callId: "call_00_C9yh9hDu6o6fFITuVO5V5480",
        tool: "bash",
        ok: false,
        preview:
          "ls: cannot access 'probe.txt': No such file or directory\n\n\nCommand exited with code 2",
        truncated: false,
      },
    ]);
  });

  it("message_end 角色不是 assistant/toolResult 时不产出事件", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, [
      JSON.stringify({
        type: "message_end",
        message: { role: "system", content: "", timestamp: 1_700_000_000_000 },
      }),
    ]);
    expect(drafts).toEqual([]);
  });

  it("message_end 没有 message 字段时不产出事件、不抛异常", () => {
    const reducer = createPiReducer();
    expect(() => feedLines(reducer, [JSON.stringify({ type: "message_end" })])).not.toThrow();
    expect(feedLines(reducer, [JSON.stringify({ type: "message_end" })])).toEqual([]);
  });
});

describe("pi reducer：重试与压缩事件", () => {
  it("auto_retry_start 产出 retry 事件：attempt 用我们自己的连续失败计数，max 固定 8", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [
      assistantMessageEndLine({ stopReason: "error", errorMessage: "Connection error." }),
    ]);
    const drafts = feedLines(reducer, [
      JSON.stringify({
        type: "auto_retry_start",
        attempt: 1,
        maxAttempts: 3,
        delayMs: 2000,
        errorMessage: "Connection error.",
      }),
    ]);
    expect(drafts).toEqual([
      {
        kind: "retry",
        at: expect.any(String),
        attempt: 1,
        max: 8,
        delayMs: 2000,
        message: "Connection error.",
      },
    ]);
  });

  it("auto_retry_start 缺 delayMs/errorMessage 时分别兜底成 null 和「未知错误」", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, [JSON.stringify({ type: "auto_retry_start" })]);
    expect(drafts).toEqual([
      {
        kind: "retry",
        at: expect.any(String),
        attempt: 0,
        max: 8,
        delayMs: null,
        message: "未知错误",
      },
    ]);
  });

  it("compaction_end 带 errorMessage 时产出 error 事件", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, [
      JSON.stringify({
        type: "compaction_end",
        reason: "overflow",
        aborted: true,
        errorMessage: "上下文太大",
      }),
    ]);
    expect(drafts).toEqual([
      { kind: "error", at: expect.any(String), message: "上下文压缩失败：上下文太大" },
    ]);
  });

  it("compaction_end 没有 errorMessage 时不产出事件（压缩成功）", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, [
      JSON.stringify({ type: "compaction_end", reason: "manual", aborted: false }),
    ]);
    expect(drafts).toEqual([]);
  });
});
