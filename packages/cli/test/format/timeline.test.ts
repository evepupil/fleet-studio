import type { TimelineEvent } from "@fleet/core";
import { describe, expect, it } from "vitest";
import { formatTimeline, formatTimelineLine } from "../../src/format/timeline.js";

const AT = new Date(2026, 8, 23, 9, 5, 3).toISOString();
const GAP = " ".repeat(2);

function prefixFor(icon: string): string {
  return `09:05:03${GAP}${icon}${GAP}`;
}

describe("formatTimelineLine", () => {
  it("工具调用格式是 工具名 · 摘要", () => {
    const event: TimelineEvent = {
      kind: "tool_call",
      seq: 1,
      runSeq: 1,
      at: AT,
      callId: "c1",
      tool: "bash",
      summary: "pnpm test",
      detail: null,
    };
    expect(formatTimelineLine(event)).toBe(`${prefixFor("→")}bash · pnpm test`);
  });

  it("工具结果只写成功与否和前 120 个字", () => {
    const longPreview = "x".repeat(200);
    const event: TimelineEvent = {
      kind: "tool_result",
      seq: 2,
      runSeq: 1,
      at: AT,
      callId: "c1",
      tool: "bash",
      ok: true,
      preview: longPreview,
      truncated: true,
    };
    const line = formatTimelineLine(event);
    const prefix = prefixFor("←");
    expect(line.startsWith(`${prefix}成功 · `)).toBe(true);
    // 120 个 x 加一个省略号
    expect(line).toBe(`${prefix}成功 · ${"x".repeat(120)}…`);
  });

  it("文字和思考压成一行截到 200 字", () => {
    const event: TimelineEvent = {
      kind: "text",
      seq: 3,
      runSeq: 1,
      at: AT,
      text: `第一行\n第二行  ${"字".repeat(210)}`,
    };
    const line = formatTimelineLine(event);
    expect(line.includes("\n")).toBe(false);
    const content = line.slice(prefixFor("·").length);
    expect(content.length).toBe(201); // 200 个字符 + 省略号
    expect(content.endsWith("…")).toBe(true);
  });

  it("重试事件格式是 重试N/M：原因", () => {
    const event: TimelineEvent = {
      kind: "retry",
      seq: 4,
      runSeq: 1,
      at: AT,
      attempt: 2,
      max: 5,
      delayMs: 1000,
      message: "连接超时",
    };
    expect(formatTimelineLine(event)).toBe(`${prefixFor("↻")}重试2/5：连接超时`);
  });

  it("run_end 带状态、失败原因和说明", () => {
    const event: TimelineEvent = {
      kind: "run_end",
      seq: 5,
      runSeq: 1,
      at: AT,
      status: "failed",
      failReason: "timeout",
      message: "运行超过 30 分钟",
    };
    expect(formatTimelineLine(event)).toBe(`${prefixFor("■")}失败·运行超时：运行超过 30 分钟`);
  });
});

describe("formatTimeline", () => {
  it("runSeq 变化时插入分隔线", () => {
    const events: TimelineEvent[] = [
      { kind: "run_start", seq: 0, runSeq: 1, at: AT, prompt: "第一次任务" },
      { kind: "run_start", seq: 1, runSeq: 2, at: AT, prompt: "续接任务" },
    ];
    const lines = formatTimeline(events);
    expect(lines[0]).toBe("── 第 1 次运行 ──");
    expect(lines[2]).toBe("── 第 2 次运行 ──");
    expect(lines.length).toBe(4);
  });
});
