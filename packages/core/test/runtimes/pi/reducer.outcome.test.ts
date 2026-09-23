import { describe, expect, it } from "vitest";
import { createPiReducer, PI_MAX_CONSECUTIVE_FAILURES } from "../../../src/runtimes/pi/reducer.js";
import { feedLines } from "./factories.js";

function errorLine(errorMessage = "Connection error."): string {
  return JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [],
      stopReason: "error",
      errorMessage,
      timestamp: 1_700_000_000_000,
    },
  });
}

function stopLine(text = "完成"): string {
  return JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      stopReason: "stop",
      timestamp: 1_700_000_000_000,
    },
  });
}

describe("pi reducer：agent_settled 收尾（模块设计 4.5）", () => {
  it("最后一个 stopReason 是 stop → 结局已完成", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [stopLine(), JSON.stringify({ type: "agent_settled" })]);
    expect(reducer.progress()).toMatchObject({ phase: "ended", outcome: { status: "completed" } });
  });

  it("最后一个 stopReason 是 error（自然收尾，没到连续失败上限）→ 失败 model_error", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [
      errorLine("404: model not found"),
      JSON.stringify({ type: "agent_settled" }),
    ]);
    expect(reducer.progress()).toMatchObject({
      phase: "ended",
      outcome: { status: "failed", reason: "model_error", message: "404: model not found" },
    });
  });

  it("最后一个 stopReason 是 aborted → 失败 runtime_error「模型调用被中止」（真实样本没抓到这种情况，按规格构造）", () => {
    const reducer = createPiReducer();
    const abortedLine = JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [],
        stopReason: "aborted",
        timestamp: 1_700_000_000_000,
      },
    });
    feedLines(reducer, [abortedLine, JSON.stringify({ type: "agent_settled" })]);
    expect(reducer.progress()).toMatchObject({
      phase: "ended",
      outcome: { status: "failed", reason: "runtime_error", message: "模型调用被中止" },
    });
  });

  it("从来没有过任何助手消息就直接 settled：兜底按已完成处理", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [JSON.stringify({ type: "agent_settled" })]);
    expect(reducer.progress().outcome).toEqual({ status: "completed" });
  });

  it("toolUse 之后紧跟 stop 再 settled：中间的 toolUse 不影响最终按 stop 判定为完成", () => {
    const reducer = createPiReducer();
    const toolUseLine = JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_1", name: "bash", arguments: { command: "ls" } }],
        stopReason: "toolUse",
        timestamp: 1_700_000_000_000,
      },
    });
    feedLines(reducer, [toolUseLine, stopLine(), JSON.stringify({ type: "agent_settled" })]);
    expect(reducer.progress().outcome).toEqual({ status: "completed" });
  });
});

describe("pi reducer：连续失败达到上限主动放弃（不等 agent_settled）", () => {
  it(`连续 ${PI_MAX_CONSECUTIVE_FAILURES} 次 stopReason=error 后，即使还没 agent_settled 也判定失败`, () => {
    const reducer = createPiReducer();
    for (let i = 0; i < PI_MAX_CONSECUTIVE_FAILURES - 1; i += 1) {
      feedLines(reducer, [errorLine("Connection error.")]);
      expect(reducer.progress().outcome).toBeNull();
      expect(reducer.progress().phase).toBe("retrying");
    }
    feedLines(reducer, [errorLine("Connection error.")]);
    expect(reducer.progress()).toMatchObject({
      phase: "ended",
      outcome: {
        status: "failed",
        reason: "model_error",
        message: `通道连续 ${PI_MAX_CONSECUTIVE_FAILURES} 次请求失败：Connection error.`,
      },
    });
  });

  it("一次成功的消息会把连续失败计数清零，不会累加到上一轮的失败次数上", () => {
    const reducer = createPiReducer();
    for (let i = 0; i < PI_MAX_CONSECUTIVE_FAILURES - 1; i += 1) {
      feedLines(reducer, [errorLine()]);
    }
    feedLines(reducer, [stopLine()]); // 清零
    for (let i = 0; i < PI_MAX_CONSECUTIVE_FAILURES - 1; i += 1) {
      feedLines(reducer, [errorLine()]);
    }
    // 又攒了 7 次失败（上限是 8），还不该放弃。
    expect(reducer.progress().outcome).toBeNull();
  });

  it("已经因为连续失败放弃之后，就算之后又收到 agent_settled，也不会覆盖已经判定的结局", () => {
    const reducer = createPiReducer();
    for (let i = 0; i < PI_MAX_CONSECUTIVE_FAILURES; i += 1) {
      feedLines(reducer, [errorLine("Connection error.")]);
    }
    const outcomeAfterGiveUp = reducer.progress().outcome;
    feedLines(reducer, [stopLine(), JSON.stringify({ type: "agent_settled" })]);
    expect(reducer.progress().outcome).toEqual(outcomeAfterGiveUp);
  });
});

describe("pi reducer：retry 字段随成败起落", () => {
  it("失败时 retry 非空，下一条成功消息把 retry 清成 null", () => {
    const reducer = createPiReducer();
    feedLines(reducer, [errorLine("Connection error.")]);
    expect(reducer.progress().retry).toEqual({
      attempt: 1,
      max: PI_MAX_CONSECUTIVE_FAILURES,
      message: "Connection error.",
    });
    feedLines(reducer, [stopLine()]);
    expect(reducer.progress().retry).toBeNull();
  });

  it("errorMessage 缺省时用「未知错误」", () => {
    const reducer = createPiReducer();
    const line = JSON.stringify({
      type: "message_end",
      message: {
        role: "assistant",
        content: [],
        stopReason: "error",
        timestamp: 1_700_000_000_000,
      },
    });
    feedLines(reducer, [line]);
    expect(reducer.progress().retry?.message).toBe("未知错误");
  });
});
