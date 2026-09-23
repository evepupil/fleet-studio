import type { FailReason, RunStatus, TimelineEvent } from "@fleet/core";

/**
 * 把服务给的原始时间线事件（一次调用一条、一次结果一条）合并成界面要画的显示行：
 * 工具调用和它的结果合成一行，方便时间线不用为了对齐两条独立事件而做额外的布局。
 */

export type TimelineFilter = "all" | "tools" | "text" | "issues";

interface ToolResultView {
  ok: boolean;
  preview: string;
  truncated: boolean;
  at: string;
}

export type TimelineRow =
  | {
      kind: "run";
      key: string;
      seq: number;
      runSeq: number;
      at: string;
      edge: "start";
      prompt: string;
    }
  | {
      kind: "run";
      key: string;
      seq: number;
      runSeq: number;
      at: string;
      edge: "end";
      status: RunStatus;
      failReason: FailReason | null;
      message: string | null;
    }
  | {
      kind: "tool";
      key: string;
      seq: number;
      runSeq: number;
      at: string;
      callId: string;
      tool: string;
      summary: string;
      detail: string | null;
      result: ToolResultView | null;
      durationMs: number | null;
    }
  | { kind: "text"; key: string; seq: number; runSeq: number; at: string; text: string }
  | { kind: "thinking"; key: string; seq: number; runSeq: number; at: string; text: string }
  | {
      kind: "retry";
      key: string;
      seq: number;
      runSeq: number;
      at: string;
      attempt: number;
      max: number;
      delayMs: number | null;
      message: string;
    }
  | { kind: "error"; key: string; seq: number; runSeq: number; at: string; message: string }
  | {
      kind: "output";
      key: string;
      seq: number;
      runSeq: number;
      at: string;
      stream: "stdout" | "stderr";
      text: string;
    };

type ToolRow = Extract<TimelineRow, { kind: "tool" }>;

/** 挂结果时用 runSeq + callId 做键，避免不同运行里偶然撞上同一个 callId 字符串。 */
function callKey(runSeq: number, callId: string): string {
  return `${runSeq}:${callId}`;
}

const ORPHAN_SUMMARY = "（没有对应的调用）";

/**
 * 合并规则：tool_call 先占一行（result 为空）；随后同一次运行里同一个 callId 的 tool_result
 * 挂到那一行上，耗时 = 结果时间 − 调用时间，算出负数说明时钟不准，按空处理；
 * 找不到调用的结果单独成一行。run_start / run_end 各自变成一条运行分隔行。
 */
export function buildTimelineRows(events: readonly TimelineEvent[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  const pendingCalls = new Map<string, ToolRow>();

  for (const event of events) {
    switch (event.kind) {
      case "run_start": {
        rows.push({
          kind: "run",
          key: String(event.seq),
          seq: event.seq,
          runSeq: event.runSeq,
          at: event.at,
          edge: "start",
          prompt: event.prompt,
        });
        break;
      }
      case "run_end": {
        rows.push({
          kind: "run",
          key: String(event.seq),
          seq: event.seq,
          runSeq: event.runSeq,
          at: event.at,
          edge: "end",
          status: event.status,
          failReason: event.failReason,
          message: event.message,
        });
        break;
      }
      case "tool_call": {
        const row: ToolRow = {
          kind: "tool",
          key: String(event.seq),
          seq: event.seq,
          runSeq: event.runSeq,
          at: event.at,
          callId: event.callId,
          tool: event.tool,
          summary: event.summary,
          detail: event.detail,
          result: null,
          durationMs: null,
        };
        rows.push(row);
        pendingCalls.set(callKey(event.runSeq, event.callId), row);
        break;
      }
      case "tool_result": {
        const key = callKey(event.runSeq, event.callId);
        const pending = pendingCalls.get(key);
        if (pending === undefined) {
          rows.push({
            kind: "tool",
            key: String(event.seq),
            seq: event.seq,
            runSeq: event.runSeq,
            at: event.at,
            callId: event.callId,
            tool: event.tool,
            summary: ORPHAN_SUMMARY,
            detail: null,
            result: {
              ok: event.ok,
              preview: event.preview,
              truncated: event.truncated,
              at: event.at,
            },
            durationMs: null,
          });
          break;
        }
        pending.result = {
          ok: event.ok,
          preview: event.preview,
          truncated: event.truncated,
          at: event.at,
        };
        const duration = Date.parse(event.at) - Date.parse(pending.at);
        pending.durationMs = duration < 0 ? null : duration;
        pendingCalls.delete(key);
        break;
      }
      case "text": {
        rows.push({
          kind: "text",
          key: String(event.seq),
          seq: event.seq,
          runSeq: event.runSeq,
          at: event.at,
          text: event.text,
        });
        break;
      }
      case "thinking": {
        rows.push({
          kind: "thinking",
          key: String(event.seq),
          seq: event.seq,
          runSeq: event.runSeq,
          at: event.at,
          text: event.text,
        });
        break;
      }
      case "retry": {
        rows.push({
          kind: "retry",
          key: String(event.seq),
          seq: event.seq,
          runSeq: event.runSeq,
          at: event.at,
          attempt: event.attempt,
          max: event.max,
          delayMs: event.delayMs,
          message: event.message,
        });
        break;
      }
      case "error": {
        rows.push({
          kind: "error",
          key: String(event.seq),
          seq: event.seq,
          runSeq: event.runSeq,
          at: event.at,
          message: event.message,
        });
        break;
      }
      case "output": {
        rows.push({
          kind: "output",
          key: String(event.seq),
          seq: event.seq,
          runSeq: event.runSeq,
          at: event.at,
          stream: event.stream,
          text: event.text,
        });
        break;
      }
    }
  }
  return rows;
}

/** 一行是不是「异常」：重试、报错、stderr 原始输出、或结果失败的工具行 */
function isIssueRow(row: TimelineRow): boolean {
  return (
    row.kind === "retry" ||
    row.kind === "error" ||
    (row.kind === "output" && row.stream === "stderr") ||
    (row.kind === "tool" && row.result !== null && !row.result.ok)
  );
}

/**
 * 筛选规则：运行分隔行在任何筛选下都保留（充当锚点，方便看清事件属于哪次运行）；
 * all 全部；tools 只留工具行；text 留文字和思考；issues 留重试、报错、stderr、失败的工具行。
 */
export function filterTimelineRows(
  rows: readonly TimelineRow[],
  filter: TimelineFilter,
): TimelineRow[] {
  if (filter === "all") {
    return [...rows];
  }
  return rows.filter((row) => {
    if (row.kind === "run") {
      return true;
    }
    if (filter === "tools") {
      return row.kind === "tool";
    }
    if (filter === "text") {
      return row.kind === "text" || row.kind === "thinking";
    }
    return isIssueRow(row);
  });
}

/** 计数只数非运行分隔行；all 数全部非运行分隔行。给筛选小片的数字用。 */
export function countTimelineRows(rows: readonly TimelineRow[]): Record<TimelineFilter, number> {
  const counts: Record<TimelineFilter, number> = { all: 0, tools: 0, text: 0, issues: 0 };
  for (const row of rows) {
    if (row.kind === "run") {
      continue;
    }
    counts.all += 1;
    if (row.kind === "tool") {
      counts.tools += 1;
    }
    if (row.kind === "text" || row.kind === "thinking") {
      counts.text += 1;
    }
    if (isIssueRow(row)) {
      counts.issues += 1;
    }
  }
  return counts;
}
