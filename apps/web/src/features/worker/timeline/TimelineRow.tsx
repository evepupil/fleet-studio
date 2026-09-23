import { Brain, CircleX, MessageSquare, RotateCw, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import { formatClock, formatShortDuration } from "../../../lib/format";
import type { TimelineRow as TimelineRowData } from "../../../lib/timelineView";
import { RunDivider } from "./RunDivider";
import styles from "./TimelineRow.module.css";
import { ToolRow } from "./ToolRow";

const {
  grid,
  time,
  iconMuted,
  iconWarning,
  iconFailed,
  content,
  textBlock,
  toggle,
  thinkingCollapsed,
  thinkingLabel,
  thinkingFirstLine,
  thinkingExpanded,
  thinkingFull,
  retryLine,
  retryLabel,
  sep,
  retryMessage,
  retryRight,
  errorText,
  outputContent,
  outputStream,
  outputText,
} = styles;

/** 文字行超过这个行数才折叠 */
const TEXT_MAX_LINES = 8;

type GenericRow = Exclude<TimelineRowData, { kind: "run" } | { kind: "tool" }>;

export interface TimelineRowProps {
  row: TimelineRowData;
  now: number;
  /** 这一行的展开状态（工具参数/结果、思考、长文字共用同一套 Set，由上层按 key 记录） */
  expanded: boolean;
  onToggle(key: string): void;
  /** 这一行是不是全部工具行里的最后一个，只有它可能转圈 */
  isLastTool: boolean;
  /** 苦工此刻是否在工作中 */
  workerRunning: boolean;
}

/** 一行时间线：run 用分隔样式，tool 用按钮 + 面板，其余用统一的四列网格。 */
export function TimelineRow({
  row,
  now,
  expanded,
  onToggle,
  isLastTool,
  workerRunning,
}: TimelineRowProps) {
  if (row.kind === "run") {
    return (
      <li data-timeline-row data-kind={row.kind} data-seq={row.seq}>
        <RunDivider row={row} now={now} expanded={expanded} onToggle={onToggle} />
      </li>
    );
  }

  if (row.kind === "tool") {
    const spinning = workerRunning && isLastTool && row.result === null;
    return (
      <li data-timeline-row data-kind={row.kind} data-seq={row.seq}>
        <ToolRow row={row} now={now} expanded={expanded} onToggle={onToggle} spinning={spinning} />
      </li>
    );
  }

  return (
    <li data-timeline-row data-kind={row.kind} data-seq={row.seq}>
      <div className={grid} data-tone={toneFor(row.kind)}>
        <span className={time}>{formatClock(row.at, now)}</span>
        {renderIcon(row)}
        {renderContent(row, expanded, onToggle)}
        {row.kind === "retry" && row.delayMs !== null && (
          <span className={retryRight}>{formatShortDuration(row.delayMs)}后</span>
        )}
      </div>
    </li>
  );
}

function toneFor(kind: GenericRow["kind"]): "neutral" | "warning" | "failed" {
  if (kind === "retry") {
    return "warning";
  }
  if (kind === "error") {
    return "failed";
  }
  return "neutral";
}

function renderIcon(row: GenericRow): ReactNode {
  switch (row.kind) {
    case "text":
      return <MessageSquare aria-hidden size={14} className={iconMuted} />;
    case "thinking":
      return <Brain aria-hidden size={14} className={iconMuted} />;
    case "retry":
      return <RotateCw aria-hidden size={14} className={iconWarning} />;
    case "error":
      return <CircleX aria-hidden size={14} className={iconFailed} />;
    case "output":
      return <Terminal aria-hidden size={14} className={iconMuted} />;
    default:
      return null;
  }
}

function renderContent(
  row: GenericRow,
  expanded: boolean,
  onToggle: (key: string) => void,
): ReactNode {
  switch (row.kind) {
    case "text":
      return <TextContent row={row} expanded={expanded} onToggle={onToggle} />;
    case "thinking":
      return <ThinkingContent row={row} expanded={expanded} onToggle={onToggle} />;
    case "retry":
      return <RetryContent row={row} />;
    case "error":
      return <ErrorContent row={row} />;
    case "output":
      return <OutputContent row={row} />;
    default:
      return null;
  }
}

interface ContentProps<T> {
  row: T;
  expanded: boolean;
  onToggle: (key: string) => void;
}

function TextContent({
  row,
  expanded,
  onToggle,
}: ContentProps<Extract<TimelineRowData, { kind: "text" }>>) {
  const overflow = row.text.split("\n").length > TEXT_MAX_LINES;
  return (
    <div className={content}>
      <p className={textBlock} data-clamped={overflow && !expanded ? "true" : "false"}>
        {row.text}
      </p>
      {overflow && (
        <button
          type="button"
          className={toggle}
          aria-expanded={expanded}
          onClick={() => onToggle(row.key)}
        >
          {expanded ? "收起" : "展开全部"}
        </button>
      )}
    </div>
  );
}

function ThinkingContent({
  row,
  expanded,
  onToggle,
}: ContentProps<Extract<TimelineRowData, { kind: "thinking" }>>) {
  if (!expanded) {
    const firstLine = row.text.split("\n")[0] ?? "";
    return (
      <button
        type="button"
        className={thinkingCollapsed}
        aria-expanded={expanded}
        onClick={() => onToggle(row.key)}
      >
        <span className={thinkingLabel}>思考</span>
        <span className={thinkingFirstLine}>{firstLine}</span>
      </button>
    );
  }
  return (
    <div className={thinkingExpanded}>
      <button
        type="button"
        className={thinkingLabel}
        aria-expanded={expanded}
        onClick={() => onToggle(row.key)}
      >
        思考
      </button>
      <p className={thinkingFull}>{row.text}</p>
    </div>
  );
}

function RetryContent({ row }: { row: Extract<TimelineRowData, { kind: "retry" }> }) {
  return (
    <span className={retryLine}>
      <span className={retryLabel}>
        重试 {row.attempt}/{row.max}
      </span>
      <span className={sep}> · </span>
      <span className={retryMessage} title={row.message}>
        {row.message}
      </span>
    </span>
  );
}

function ErrorContent({ row }: { row: Extract<TimelineRowData, { kind: "error" }> }) {
  return (
    <p className={errorText} title={row.message}>
      {row.message}
    </p>
  );
}

function OutputContent({ row }: { row: Extract<TimelineRowData, { kind: "output" }> }) {
  return (
    <div className={outputContent} title={row.text}>
      <span className={outputStream}>{row.stream}</span>
      <p className={outputText}>{row.text}</p>
    </div>
  );
}
