import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TEXT_EVENT_MAX,
  type TimelineDraft,
  TOOL_RESULT_PREVIEW_MAX,
} from "../../../src/domain/timeline.js";
import type { ProcessExit } from "../../../src/lifecycle/index.js";
import { resolveRunOutcome } from "../../../src/lifecycle/index.js";
import { opencodeAdapter } from "../../../src/runtimes/opencode/index.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/opencode");

/** 真实样本抓取时用的 fallback：明显不同于样本里任何 timestamp，用来分辨"到底用没用事件自带的时间戳"。 */
const FALLBACK_AT = "1999-01-01T00:00:00.000Z";

function readFixtureLines(name: string): string[] {
  const text = readFileSync(join(FIXTURES_DIR, name), "utf8");
  return text.split(/\r?\n/).filter((line) => line.length > 0);
}

/** 把整份夹具逐行喂给一个新建的 reducer，收集全部产出的草稿和最终进展。 */
function replay(name: string) {
  const reducer = opencodeAdapter.createReducer();
  const drafts: TimelineDraft[] = [];
  for (const line of readFixtureLines(name)) {
    drafts.push(...reducer.push(line, "stdout", FALLBACK_AT));
  }
  return { drafts, progress: reducer.progress() };
}

function iso(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

describe("opencodeAdapter.createReducer：真实样本逐行喂入", () => {
  it("01b-diag：纯文本回复，最终判定为已完成", () => {
    const { drafts, progress } = replay("01b-diag.stdout.jsonl");
    expect(drafts).toEqual([{ kind: "text", at: iso(1790152078832), text: "已收到" }]);
    expect(progress).toEqual({
      sessionRef: "ses_f32a0453dffeUxM35Vg6WbMKUF",
      phase: "working",
      outcome: { status: "completed" },
      retry: null,
      usage: {
        inputTokens: 523,
        outputTokens: 3,
        cacheReadTokens: 14998,
        cacheWriteTokens: 0,
        totalTokens: 15524,
        costUsd: 0,
      },
      activity: null,
      lastEventAt: iso(1790152078834),
      finalText: "已收到",
      plainOutputTail: null,
      model: null,
      eventCount: 1,
    });
  });

  it("s02-tools：两次工具调用（write/read）加一段结论文字，用量按三个 step 累加", () => {
    const { drafts, progress } = replay("s02-tools.stdout.jsonl");
    expect(drafts).toHaveLength(5);
    expect(drafts[0]).toEqual({
      kind: "tool_call",
      at: iso(1790154783327),
      callId: "call_00_YnTADKIcK8yiTRspGIyN3957",
      tool: "write",
      summary: "s2check.txt",
      detail: '{\n  "filePath": "s2check.txt",\n  "content": "ok"\n}',
    });
    expect(drafts[1]).toEqual({
      kind: "tool_result",
      at: iso(1790154783327),
      callId: "call_00_YnTADKIcK8yiTRspGIyN3957",
      tool: "write",
      ok: true,
      preview: "Wrote file successfully.",
      truncated: false,
    });
    expect(drafts[2]).toEqual({
      kind: "tool_call",
      at: iso(1790154786199),
      callId: "call_00_lX6oVJGLzAAwkrTn9Z7N3492",
      tool: "read",
      summary: "s2check.txt",
      detail: '{\n  "filePath": "s2check.txt"\n}',
    });
    expect(drafts[3]?.kind).toBe("tool_result");
    if (drafts[3]?.kind === "tool_result") {
      expect(drafts[3].ok).toBe(true);
      expect(drafts[3].truncated).toBe(false);
      expect(drafts[3].preview).toContain("total 1 lines");
    }
    expect(drafts[4]).toEqual({
      kind: "text",
      at: iso(1790154793167),
      text: "已创建 `s2check.txt`，文件内容为：**ok**",
    });

    expect(progress.sessionRef).toBe("ses_f3285a0c1ffeus2Yf3btb7pOfh");
    expect(progress.outcome).toEqual({ status: "completed" });
    expect(progress.usage).toEqual({
      inputTokens: 1930,
      outputTokens: 115,
      cacheReadTokens: 44971,
      cacheWriteTokens: 0,
      totalTokens: 47029,
      costUsd: 0,
    });
    expect(progress.activity).toBe("read · s2check.txt");
    expect(progress.finalText).toBe("已创建 `s2check.txt`，文件内容为：**ok**");
    expect(progress.eventCount).toBe(5);
  });

  it("03-continue：续接后只有新事件，没有历史重放", () => {
    const { drafts, progress } = replay("03-continue.stdout.jsonl");
    expect(drafts).toEqual([{ kind: "text", at: iso(1790152749173), text: "hello.txt" }]);
    expect(progress.sessionRef).toBe("ses_f3298e18affeCx8qXeUpy9zQu4");
    expect(progress.outcome).toEqual({ status: "completed" });
    expect(progress.finalText).toBe("hello.txt");
    expect(progress.usage).toEqual({
      inputTokens: 15951,
      outputTokens: 3,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 15954,
      costUsd: 0,
    });
  });

  it("04-badmodel：模型名不存在，请求级别直接被拒绝，只有一行 error", () => {
    const { drafts, progress } = replay("04-badmodel.stdout.jsonl");
    expect(drafts).toEqual([
      {
        kind: "error",
        at: iso(1790152675972),
        message: "Unexpected server error. Check server logs for details.",
      },
    ]);
    expect(progress.sessionRef).toBe("ses_f3295f342ffeyfS3UW8U3jhvoc");
    // 从没出现过 step_start：阶段停在 starting，不是 opencode 的收尾事件，是这次运行压根没真正开始过。
    expect(progress.phase).toBe("starting");
    expect(progress.outcome).toEqual({
      status: "failed",
      reason: "model_error",
      message: "Unexpected server error. Check server logs for details.",
    });
    expect(progress.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      costUsd: null,
    });
  });

  it("05-noauto-permission：权限被拒的工具调用，事件流没有给出任何结局", () => {
    const { drafts, progress } = replay("05-noauto-permission.stdout.jsonl");
    expect(drafts).toEqual([
      {
        kind: "tool_call",
        at: iso(1790152793476),
        callId: "call_00_9XCWTFJqcDFDNT04FTbV2199",
        tool: "bash",
        summary: "echo hi",
        detail: '{\n  "command": "echo hi"\n}',
      },
      {
        kind: "tool_result",
        at: iso(1790152793476),
        callId: "call_00_9XCWTFJqcDFDNT04FTbV2199",
        tool: "bash",
        ok: false,
        preview: "The user rejected permission to use this specific tool call.",
        truncated: false,
      },
    ]);
    expect(progress.sessionRef).toBe("ses_f32949ae1ffeHQ3EsUalLmmLjg");
    expect(progress.activity).toBe("bash · echo hi");
    // reason 是 "tool-calls"，不是 "stop"，事件流里也没有 error：结局留给进程退出去判断，这里就该是 null。
    expect(progress.outcome).toBeNull();
    expect(progress.finalText).toBeNull();
    expect(progress.usage).toEqual({
      inputTokens: 14708,
      outputTokens: 38,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 14761,
      costUsd: 0,
    });
  });
});

describe("opencodeAdapter.createReducer：单条规则", () => {
  it("空行忽略：不产出草稿，也不改变任何状态", () => {
    const reducer = opencodeAdapter.createReducer();
    const before = reducer.progress();
    expect(reducer.push("   ", "stdout", "2026-01-01T00:00:00.000Z")).toEqual([]);
    expect(reducer.progress()).toEqual(before);
  });

  it("非 JSON 行产出 output 事件，并记进原始输出尾巴", () => {
    const reducer = opencodeAdapter.createReducer();
    const drafts = reducer.push("Error: missing API key", "stderr", "2026-01-01T00:00:00.000Z");
    expect(drafts).toEqual([
      {
        kind: "output",
        at: "2026-01-01T00:00:00.000Z",
        stream: "stderr",
        text: "Error: missing API key",
      },
    ]);
    expect(reducer.progress().plainOutputTail).toBe("Error: missing API key");
    expect(reducer.progress().eventCount).toBe(1);
  });

  it("坏 JSON（语法错误）按非 JSON 处理", () => {
    const reducer = opencodeAdapter.createReducer();
    const drafts = reducer.push('{"type":"text"', "stdout", "t");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.kind).toBe("output");
  });

  it("合法 JSON 但不是带字符串 type 字段的对象，按非 JSON 处理", () => {
    const reducer = opencodeAdapter.createReducer();
    expect(reducer.push("[1,2,3]", "stdout", "t")[0]?.kind).toBe("output");
    expect(reducer.push('{"foo":1}', "stdout", "t")[0]?.kind).toBe("output");
    expect(reducer.push('{"type":123}', "stdout", "t")[0]?.kind).toBe("output");
    expect(reducer.push("42", "stdout", "t")[0]?.kind).toBe("output");
  });

  it("完全不认识的类型不产出事件、不算错误，但仍更新 sessionRef 和 lastEventAt", () => {
    const reducer = opencodeAdapter.createReducer();
    const line = JSON.stringify({
      type: "future_event",
      timestamp: 1700000000000,
      sessionID: "ses_future",
    });
    const drafts = reducer.push(line, "stdout", "2000-01-01T00:00:00.000Z");
    expect(drafts).toEqual([]);
    const progress = reducer.progress();
    expect(progress.sessionRef).toBe("ses_future");
    expect(progress.lastEventAt).toBe(iso(1700000000000));
    expect(progress.eventCount).toBe(0);
  });

  it("已识别类型但缺少必要字段导致内部出错时，产出「解析事件出错」而不是抛异常", () => {
    const reducer = opencodeAdapter.createReducer();
    const line = JSON.stringify({ type: "tool_use", timestamp: 1700000000000, sessionID: "ses_x" });
    const drafts = reducer.push(line, "stdout", "t");
    expect(drafts).toHaveLength(1);
    const [draft] = drafts;
    expect(draft?.kind).toBe("error");
    if (draft?.kind === "error") {
      expect(draft.message).toContain("解析事件出错");
    }
    // 内部出错不该让 push 抛异常；能走到这里、断言完成，本身就说明没有抛出。
  });

  it("timestamp 缺失或不是有限数时，用调用方传入的 at", () => {
    const reducer = opencodeAdapter.createReducer();
    const drafts = reducer.push(
      JSON.stringify({ type: "text", sessionID: "s", part: { text: "hi" } }),
      "stdout",
      "2026-05-01T00:00:00.000Z",
    );
    expect(drafts).toEqual([{ kind: "text", at: "2026-05-01T00:00:00.000Z", text: "hi" }]);
  });

  it("sessionRef 只取第一次出现的 sessionID，后续行不会覆盖", () => {
    const reducer = opencodeAdapter.createReducer();
    reducer.push(
      JSON.stringify({ type: "step_start", timestamp: 1, sessionID: "ses_first" }),
      "stdout",
      "t",
    );
    reducer.push(
      JSON.stringify({ type: "step_start", timestamp: 2, sessionID: "ses_second" }),
      "stdout",
      "t",
    );
    expect(reducer.progress().sessionRef).toBe("ses_first");
  });

  it("text/reasoning 的 part.text 为空字符串时不产出事件", () => {
    const reducer = opencodeAdapter.createReducer();
    const textLine = JSON.stringify({
      type: "text",
      timestamp: 1,
      sessionID: "s",
      part: { text: "" },
    });
    const reasoningLine = JSON.stringify({
      type: "reasoning",
      timestamp: 1,
      sessionID: "s",
      part: { text: "" },
    });
    expect(reducer.push(textLine, "stdout", "t")).toEqual([]);
    expect(reducer.push(reasoningLine, "stdout", "t")).toEqual([]);
  });

  it("reasoning 事件产出 thinking 事件（本地样本没覆盖到，字段形状按源码确认过：跟 text 同构，只是 type 不同）", () => {
    const reducer = opencodeAdapter.createReducer();
    const line = JSON.stringify({
      type: "reasoning",
      timestamp: 1700000000000,
      sessionID: "ses_x",
      part: {
        id: "prt_1",
        messageID: "msg_1",
        sessionID: "ses_x",
        type: "reasoning",
        text: "先看看文件内容",
      },
    });
    const drafts = reducer.push(line, "stdout", "t");
    expect(drafts).toEqual([{ kind: "thinking", at: iso(1700000000000), text: "先看看文件内容" }]);
  });

  it("text 内容超过 TEXT_EVENT_MAX 时截断", () => {
    const reducer = opencodeAdapter.createReducer();
    const longText = "x".repeat(TEXT_EVENT_MAX + 100);
    const drafts = reducer.push(
      JSON.stringify({ type: "text", timestamp: 1, sessionID: "s", part: { text: longText } }),
      "stdout",
      "t",
    );
    const [draft] = drafts;
    expect(draft?.kind).toBe("text");
    if (draft?.kind === "text") {
      expect(draft.text.length).toBe(TEXT_EVENT_MAX);
      expect(draft.text.endsWith("…")).toBe(true);
    }
  });

  it("工具参数为空对象时 detail 为 null，摘要用参数 JSON 压成一行；结果预览超长会截断并标记 truncated", () => {
    const reducer = opencodeAdapter.createReducer();
    const longOutput = "y".repeat(TOOL_RESULT_PREVIEW_MAX + 50);
    const drafts = reducer.push(
      JSON.stringify({
        type: "tool_use",
        timestamp: 1,
        sessionID: "s",
        part: {
          tool: "bash",
          callID: "call_1",
          state: { status: "completed", input: {}, output: longOutput },
        },
      }),
      "stdout",
      "t",
    );
    const [callDraft, resultDraft] = drafts;
    expect(callDraft?.kind).toBe("tool_call");
    if (callDraft?.kind === "tool_call") {
      expect(callDraft.detail).toBeNull();
      expect(callDraft.summary).toBe("{}");
    }
    expect(resultDraft?.kind).toBe("tool_result");
    if (resultDraft?.kind === "tool_result") {
      expect(resultDraft.truncated).toBe(true);
      expect(resultDraft.preview.length).toBe(TOOL_RESULT_PREVIEW_MAX);
    }
  });

  it("token 字段缺失或不是有限数按 0；费用不是有限数时保留原值（累加而不是替换）", () => {
    const reducer = opencodeAdapter.createReducer();
    reducer.push(
      JSON.stringify({
        type: "step_finish",
        timestamp: 1,
        sessionID: "s",
        part: { reason: "tool-calls", tokens: { input: Number.NaN, output: "x" }, cost: "unknown" },
      }),
      "stdout",
      "t",
    );
    expect(reducer.progress().usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      costUsd: null,
    });

    reducer.push(
      JSON.stringify({
        type: "step_finish",
        timestamp: 2,
        sessionID: "s",
        part: { reason: "tool-calls", tokens: { input: 5 }, cost: 0.5 },
      }),
      "stdout",
      "t",
    );
    expect(reducer.progress().usage.costUsd).toBe(0.5);
    expect(reducer.progress().usage.inputTokens).toBe(5);

    reducer.push(
      JSON.stringify({
        type: "step_finish",
        timestamp: 3,
        sessionID: "s",
        part: { reason: "tool-calls", tokens: {}, cost: "still unknown" },
      }),
      "stdout",
      "t",
    );
    expect(reducer.progress().usage.costUsd).toBe(0.5);
  });

  it("先暂定已完成，随后出现致命错误时改判失败（覆盖暂定的已完成）", () => {
    const reducer = opencodeAdapter.createReducer();
    reducer.push(
      JSON.stringify({ type: "step_start", timestamp: 1, sessionID: "s" }),
      "stdout",
      "t",
    );
    reducer.push(
      JSON.stringify({ type: "text", timestamp: 2, sessionID: "s", part: { text: "先给个结论" } }),
      "stdout",
      "t",
    );
    reducer.push(
      JSON.stringify({
        type: "step_finish",
        timestamp: 3,
        sessionID: "s",
        part: {
          reason: "stop",
          tokens: { total: 1, input: 1, output: 0, cache: { read: 0, write: 0 } },
          cost: 0,
        },
      }),
      "stdout",
      "t",
    );
    expect(reducer.progress().outcome).toEqual({ status: "completed" });

    reducer.push(
      JSON.stringify({
        type: "error",
        timestamp: 4,
        sessionID: "s",
        error: { name: "SessionError" },
      }),
      "stdout",
      "t",
    );
    expect(reducer.progress().outcome).toEqual({
      status: "failed",
      reason: "model_error",
      message: "SessionError",
    });
  });

  it("原始输出尾巴只保留最后 5 行", () => {
    const reducer = opencodeAdapter.createReducer();
    for (let i = 1; i <= 7; i += 1) {
      reducer.push(`line ${i}`, "stdout", "t");
    }
    expect(reducer.progress().plainOutputTail).toBe(
      ["line 3", "line 4", "line 5", "line 6", "line 7"].join("\n"),
    );
  });
});

describe("opencodeAdapter.createReducer：stderr 夹带权限拒绝提示不影响成功判定（D6②）", () => {
  it("stdout 正常走完成功流程，stderr 混入一行 auto-rejecting 提示：outcome 仍是已完成，resolveRunOutcome 也判完成", () => {
    const reducer = opencodeAdapter.createReducer();
    reducer.push(
      JSON.stringify({ type: "step_start", timestamp: 1, sessionID: "ses_1" }),
      "stdout",
      "t",
    );
    // --auto 模式下，opencode 遇到不在允许列表里的工具调用会自动拒绝，并在 stderr 打一行
    // 提示；这不是事件流 JSON，只是纯文本，按规格应该落进 output/plainOutputTail，
    // 不该影响后面 step_finish 给出的结局判定。
    const stderrDrafts = reducer.push(
      "permission requested: bash (*); auto-rejecting",
      "stderr",
      "t",
    );
    reducer.push(
      JSON.stringify({ type: "text", timestamp: 2, sessionID: "ses_1", part: { text: "已完成" } }),
      "stdout",
      "t",
    );
    reducer.push(
      JSON.stringify({
        type: "step_finish",
        timestamp: 3,
        sessionID: "ses_1",
        part: {
          reason: "stop",
          tokens: { input: 10, output: 5, cache: { read: 0, write: 0 }, total: 15 },
          cost: 0,
        },
      }),
      "stdout",
      "t",
    );

    expect(stderrDrafts).toEqual([
      {
        kind: "output",
        at: "t",
        stream: "stderr",
        text: "permission requested: bash (*); auto-rejecting",
      },
    ]);

    const progress = reducer.progress();
    expect(progress.outcome).toEqual({ status: "completed" });
    expect(progress.plainOutputTail).toBe("permission requested: bash (*); auto-rejecting");

    // 交给 resolveRunOutcome 合并退出信息（退出码 0）：事件流已经给出「已完成」，
    // 规则 1 直接命中，不会被规则 8 的 plainOutputTail 兜底逻辑误判成失败。
    const exit: ProcessExit = { kind: "exited", code: 0, signal: null };
    const resolved = resolveRunOutcome({ progress, exit, killedBy: null, timeoutMs: 30 * 60_000 });
    expect(resolved).toEqual({ status: "completed", failReason: null, message: null });
  });
});
