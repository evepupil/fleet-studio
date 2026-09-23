import {
  FAIL_REASON_LABELS,
  STATUS_LABELS,
  type TimelineEvent,
  type TimelineKind,
} from "@fleet/core";
import { formatTimeOnly } from "./time.js";

/** 每种时间线事件的图标（规格 3.4 log：「时:分:秒  图标  内容」）。 */
const ICONS: Record<TimelineKind, string> = {
  run_start: "▶",
  text: "·",
  thinking: "…",
  tool_call: "→",
  tool_result: "←",
  retry: "↻",
  error: "✗",
  output: "▪",
  run_end: "■",
};

const TEXT_LINE_MAX_CHARS = 200;
const TOOL_RESULT_PREVIEW_MAX_CHARS = 120;

/** 多行压成一行再截断：中间的换行、连续空白都收成一个空格。 */
function compressToOneLine(text: string, maxChars: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > maxChars ? `${collapsed.slice(0, maxChars)}…` : collapsed;
}

function describeEvent(event: TimelineEvent): string {
  switch (event.kind) {
    case "run_start":
      return `开始：${compressToOneLine(event.prompt, TEXT_LINE_MAX_CHARS)}`;
    case "text":
    case "thinking":
      return compressToOneLine(event.text, TEXT_LINE_MAX_CHARS);
    case "tool_call":
      // 格式与 WorkerRecord.activity 一致：<工具名> · <摘要>，例如 bash · pnpm test。
      return `${event.tool} · ${event.summary}`;
    case "tool_result":
      return `${event.ok ? "成功" : "失败"} · ${compressToOneLine(event.preview, TOOL_RESULT_PREVIEW_MAX_CHARS)}`;
    case "retry":
      return `重试${event.attempt}/${event.max}：${event.message}`;
    case "error":
      return compressToOneLine(event.message, TEXT_LINE_MAX_CHARS);
    case "output":
      return compressToOneLine(event.text, TEXT_LINE_MAX_CHARS);
    case "run_end": {
      const status = STATUS_LABELS[event.status];
      const reason = event.failReason !== null ? `·${FAIL_REASON_LABELS[event.failReason]}` : "";
      const message =
        event.message !== null && event.message.length > 0 ? `：${event.message}` : "";
      return `${status}${reason}${message}`;
    }
  }
}

/** 单条时间线渲染成一行：时:分:秒  图标  内容。 */
export function formatTimelineLine(event: TimelineEvent): string {
  return `${formatTimeOnly(event.at)}  ${ICONS[event.kind]}  ${describeEvent(event)}`;
}

/** 每次运行开头打一行分隔（规格 3.4 log）。 */
export function formatRunSeparator(runSeq: number): string {
  return `── 第 ${runSeq} 次运行 ──`;
}

/** 整段时间线渲染成逐行文本；runSeq 变化时先插入分隔线。 */
export function formatTimeline(events: readonly TimelineEvent[]): string[] {
  const lines: string[] = [];
  let lastRunSeq: number | null = null;
  for (const event of events) {
    if (event.runSeq !== lastRunSeq) {
      lines.push(formatRunSeparator(event.runSeq));
      lastRunSeq = event.runSeq;
    }
    lines.push(formatTimelineLine(event));
  }
  return lines;
}
