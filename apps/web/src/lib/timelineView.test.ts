import type { TimelineEvent } from "@fleet/core";
import { describe, expect, it } from "vitest";
import { buildDemoScenario } from "../api/demo/scenarios";
import { buildTimelineRows, countTimelineRows, filterTimelineRows } from "./timelineView";

const BASE_MS = Date.parse("2026-09-23T00:00:00.000Z");

function at(offsetMs: number): string {
  return new Date(BASE_MS + offsetMs).toISOString();
}

/**
 * 一次运行的合成夹具：文字、思考、一对正常的工具调用与结果、重试、报错、
 * 一对失败的工具调用与结果、stderr 原始输出、一条找不到调用的结果。
 */
const SAMPLE_EVENTS: TimelineEvent[] = [
  { kind: "run_start", seq: 0, runSeq: 1, at: at(0), prompt: "任务" },
  { kind: "text", seq: 1, runSeq: 1, at: at(100), text: "先看文件" },
  {
    kind: "tool_call",
    seq: 2,
    runSeq: 1,
    at: at(200),
    callId: "c1",
    tool: "read",
    summary: "a.ts",
    detail: null,
  },
  {
    kind: "tool_result",
    seq: 3,
    runSeq: 1,
    at: at(500),
    callId: "c1",
    tool: "read",
    ok: true,
    preview: "export const a = 1;",
    truncated: false,
  },
  { kind: "thinking", seq: 4, runSeq: 1, at: at(600), text: "想一下" },
  {
    kind: "retry",
    seq: 5,
    runSeq: 1,
    at: at(700),
    attempt: 1,
    max: 8,
    delayMs: 2000,
    message: "Connection error.",
  },
  { kind: "error", seq: 6, runSeq: 1, at: at(750), message: "Connection error." },
  {
    kind: "tool_call",
    seq: 7,
    runSeq: 1,
    at: at(800),
    callId: "c2",
    tool: "bash",
    summary: "pnpm test",
    detail: null,
  },
  {
    kind: "tool_result",
    seq: 8,
    runSeq: 1,
    at: at(900),
    callId: "c2",
    tool: "bash",
    ok: false,
    preview: "boom",
    truncated: false,
  },
  { kind: "output", seq: 9, runSeq: 1, at: at(950), stream: "stderr", text: "warn" },
  {
    kind: "tool_result",
    seq: 10,
    runSeq: 1,
    at: at(1000),
    callId: "orphan",
    tool: "bash",
    ok: true,
    preview: "x",
    truncated: false,
  },
  {
    kind: "run_end",
    seq: 11,
    runSeq: 1,
    at: at(1100),
    status: "completed",
    failReason: null,
    message: null,
  },
];

describe("buildTimelineRows：合并调用与结果", () => {
  const rows = buildTimelineRows(SAMPLE_EVENTS);

  it("12 条原始事件里 2 对调用与结果各合成一行，共 10 行", () => {
    expect(rows).toHaveLength(10);
  });

  it("正常的调用挂上结果并算出耗时", () => {
    const row = rows.find((item) => item.kind === "tool" && item.callId === "c1");
    expect(row?.kind).toBe("tool");
    if (row?.kind === "tool") {
      expect(row.result).toEqual({
        ok: true,
        preview: "export const a = 1;",
        truncated: false,
        at: at(500),
      });
      expect(row.durationMs).toBe(300);
    }
  });

  it("结果比调用早时耗时算出负数，按 null 处理", () => {
    const skewed: TimelineEvent[] = [
      {
        kind: "tool_call",
        seq: 0,
        runSeq: 1,
        at: at(1000),
        callId: "s1",
        tool: "bash",
        summary: "x",
        detail: null,
      },
      {
        kind: "tool_result",
        seq: 1,
        runSeq: 1,
        at: at(500),
        callId: "s1",
        tool: "bash",
        ok: true,
        preview: "y",
        truncated: false,
      },
    ];
    const skewedRows = buildTimelineRows(skewed);
    const row = skewedRows.find((item) => item.kind === "tool");
    expect(row?.kind).toBe("tool");
    if (row?.kind === "tool") {
      expect(row.durationMs).toBeNull();
    }
  });

  it("找不到对应调用的结果单独成一行，摘要写「没有对应的调用」", () => {
    const row = rows.find((item) => item.kind === "tool" && item.callId === "orphan");
    expect(row?.kind).toBe("tool");
    if (row?.kind === "tool") {
      expect(row.summary).toBe("（没有对应的调用）");
      expect(row.result?.ok).toBe(true);
      expect(row.durationMs).toBeNull();
    }
  });

  it("运行分隔行原样保留开始和结束", () => {
    expect(rows[0]).toMatchObject({ kind: "run", edge: "start" });
    expect(rows.at(-1)).toMatchObject({ kind: "run", edge: "end", status: "completed" });
  });
});

describe("filterTimelineRows：四种筛选", () => {
  const rows = buildTimelineRows(SAMPLE_EVENTS);

  it("all 保留全部行", () => {
    expect(filterTimelineRows(rows, "all")).toHaveLength(10);
  });

  it("tools 只留运行分隔和工具行", () => {
    const filtered = filterTimelineRows(rows, "tools");
    expect(filtered).toHaveLength(5);
    expect(filtered.every((row) => row.kind === "run" || row.kind === "tool")).toBe(true);
  });

  it("text 只留运行分隔、文字和思考", () => {
    const filtered = filterTimelineRows(rows, "text");
    expect(filtered).toHaveLength(4);
    expect(
      filtered.every((row) => row.kind === "run" || row.kind === "text" || row.kind === "thinking"),
    ).toBe(true);
  });

  it("issues 留运行分隔、重试、报错、stderr 输出、失败的工具行", () => {
    const filtered = filterTimelineRows(rows, "issues");
    expect(filtered).toHaveLength(6);
    const nonRun = filtered.filter((row) => row.kind !== "run");
    expect(nonRun.map((row) => row.kind).sort()).toEqual(["error", "output", "retry", "tool"]);
    const toolRow = nonRun.find((row) => row.kind === "tool");
    expect(toolRow?.kind === "tool" && toolRow.callId).toBe("c2");
  });
});

describe("countTimelineRows：只数非运行分隔行", () => {
  const rows = buildTimelineRows(SAMPLE_EVENTS);
  const counts = countTimelineRows(rows);

  it("all 数全部非运行分隔行", () => {
    expect(counts.all).toBe(8);
  });

  it("其余三种筛选各自计数", () => {
    expect(counts.tools).toBe(3);
    expect(counts.text).toBe(2);
    expect(counts.issues).toBe(4);
  });
});

describe("真实演示数据 wr8v2k（数字见 design/工作区.md 交互检查）", () => {
  const events = buildDemoScenario("busy").timelines.get("wr8v2k") ?? [];
  const rows = buildTimelineRows(events);

  it("全部 19 行", () => {
    expect(rows).toHaveLength(19);
  });

  it("工具筛选 12 行（含 4 条运行分隔）", () => {
    expect(filterTimelineRows(rows, "tools")).toHaveLength(12);
  });

  it("异常筛选 8 行（含 4 条运行分隔）", () => {
    expect(filterTimelineRows(rows, "issues")).toHaveLength(8);
  });
});
