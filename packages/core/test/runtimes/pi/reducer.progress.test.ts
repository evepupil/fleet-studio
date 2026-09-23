import { describe, expect, it } from "vitest";
import { createPiReducer } from "../../../src/runtimes/pi/reducer.js";
import { assistantMessageEndLine, DEFAULT_AT, feedLines } from "./factories.js";

describe("pi reducer：session 与 agent_start", () => {
  it("session 事件记下 sessionRef，不产出事件", () => {
    const reducer = createPiReducer();
    const drafts = feedLines(reducer, [
      JSON.stringify({
        type: "session",
        version: 3,
        id: "fleet-w1",
        timestamp: "2026-09-23T08:00:00.000Z",
      }),
    ]);
    expect(drafts).toEqual([]);
    expect(reducer.progress().sessionRef).toBe("fleet-w1");
  });

  it("agent_start 把阶段从 starting 推进到 working", () => {
    const reducer = createPiReducer();
    expect(reducer.progress().phase).toBe("starting");
    feedLines(reducer, [JSON.stringify({ type: "agent_start" })]);
    expect(reducer.progress().phase).toBe("working");
  });

  it("agent_start 不会把 retrying 阶段拉回 working", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [
      assistantMessageEndLine({ stopReason: "error", errorMessage: "Connection error." }),
    ]);
    expect(reducer.progress().phase).toBe("retrying");
    feedLines(reducer, [JSON.stringify({ type: "agent_start" })]);
    expect(reducer.progress().phase).toBe("retrying");
  });
});

describe("pi reducer：eventCount 与 lastEventAt", () => {
  it("eventCount 按累计产出的事件数增加，不是按处理的行数", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [JSON.stringify({ type: "agent_start" })]); // 0 个事件
    expect(reducer.progress().eventCount).toBe(0);
    feedLines(reducer, [
      assistantMessageEndLine({
        content: [
          { type: "text", text: "完成" },
          { type: "toolCall", id: "call_1", name: "bash", arguments: { command: "ls" } },
        ],
      }),
    ]); // 2 个事件：text + tool_call
    expect(reducer.progress().eventCount).toBe(2);
  });

  it("session 的 ISO 时间戳直接作为 lastEventAt", () => {
    const reducer = createPiReducer();
    feedLines(
      reducer,
      [JSON.stringify({ type: "session", id: "s1", timestamp: "2026-01-01T00:00:00.000Z" })],
      "stdout",
      DEFAULT_AT,
    );
    expect(reducer.progress().lastEventAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("带 message 的事件用 message.timestamp（毫秒）换算成 ISO", () => {
    const reducer = createPiReducer();
    feedLines(
      reducer,
      [assistantMessageEndLine({ timestamp: 1_700_000_000_000 })],
      "stdout",
      DEFAULT_AT,
    );
    expect(reducer.progress().lastEventAt).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it("没有自带时间的事件（如 agent_start）落回调用方传入的 at", () => {
    const reducer = createPiReducer();
    feedLines(
      reducer,
      [JSON.stringify({ type: "agent_start" })],
      "stdout",
      "2026-05-01T00:00:00.000Z",
    );
    expect(reducer.progress().lastEventAt).toBe("2026-05-01T00:00:00.000Z");
  });
});
