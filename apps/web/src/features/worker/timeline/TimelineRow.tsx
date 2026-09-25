import { Brain, CircleX, MessageSquare, RotateCw, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import { formatClock, formatShortDuration } from "@/lib/format";
import type { TimelineRow as TimelineRowData } from "@/lib/timelineView";
import { RunDivider } from "./RunDivider";
import { ToolRow } from "./ToolRow";

/** 文字行超过这个行数才折叠 */
const TEXT_MAX_LINES = 8;

/** 行底色按类型分三档：重试黄底、报错红底、其余不着色。完整类名写在映射里，不做拼接。 */
const TONE_CLASS: Readonly<Record<"neutral" | "warning" | "failed", string>> = {
  neutral: "",
  warning: "rounded-sm bg-status-warning-soft px-2",
  failed: "rounded-sm bg-status-failed-soft px-2",
};

/** 四列网格：时间 / 图标 / 内容 / 右侧附加信息；< 1024px 去掉第 4 列，附加信息落到第 3 列下一行。 */
const GRID_CLASS =
  "grid grid-cols-[56px_16px_minmax(0,1fr)] items-start gap-x-2.5 py-1.5 lg:grid-cols-[64px_16px_minmax(0,1fr)_auto]";

type GenericRow = Exclude<TimelineRowData, { kind: "run" } | { kind: "tool" }>;

export interface TimelineRowProps {
  row: TimelineRowData;
  now: number;
  /** 这一行的展开状态（工具参数/结果、思考、长文字共用同一套 Set，由上层按 key 记录） */
  expanded: boolean;
  onToggle(key: string): void;
  /** 这一行是不是全部工具行里的最后一个，只有它可能转圈 */
  isLastTool: boolean;
  /** 苦工此刻是否在工作 */
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
      <div
        className={`${GRID_CLASS} ${TONE_CLASS[toneFor(row.kind)]}`}
        data-tone={toneFor(row.kind)}
      >
        <span className="font-mono text-12 text-fg-3">{formatClock(row.at, now)}</span>
        {renderIcon(row)}
        {renderContent(row, expanded, onToggle)}
        {row.kind === "retry" && row.delayMs !== null && (
          <span className="col-start-3 row-start-2 mt-0.5 self-start font-mono text-12 whitespace-nowrap text-fg-3 lg:col-start-4 lg:row-start-1 lg:mt-0">
            {formatShortDuration(row.delayMs)}后
          </span>
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
      return <MessageSquare aria-hidden size={14} className="mt-[3px] text-fg-3" />;
    case "thinking":
      return <Brain aria-hidden size={14} className="mt-[3px] text-fg-3" />;
    case "retry":
      return <RotateCw aria-hidden size={14} className="mt-[3px] text-status-warning" />;
    case "error":
      return <CircleX aria-hidden size={14} className="mt-[3px] text-status-failed" />;
    case "output":
      return <Terminal aria-hidden size={14} className="mt-[3px] text-fg-3" />;
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
    <div className="flex min-w-0 flex-col items-start gap-1">
      <p
        data-clamped={overflow && !expanded ? "true" : "false"}
        className={`m-0 w-full min-w-0 text-13 wrap-anywhere whitespace-pre-wrap text-fg-1 ${overflow && !expanded ? "line-clamp-8" : ""}`}
      >
        {row.text}
      </p>
      {overflow && (
        <button
          type="button"
          className="text-12 text-brand hover:underline"
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
        className="inline-flex max-w-full min-w-0 items-center gap-1"
        aria-expanded={expanded}
        onClick={() => onToggle(row.key)}
      >
        <span className="shrink-0 text-12 text-fg-3">思考</span>
        <span className="min-w-0 truncate text-12 text-fg-3 italic">{firstLine}</span>
      </button>
    );
  }
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-1">
      <button
        type="button"
        className="text-12 text-fg-3"
        aria-expanded={expanded}
        onClick={() => onToggle(row.key)}
      >
        思考
      </button>
      <p className="m-0 max-h-[320px] w-full min-w-0 overflow-y-auto text-12 wrap-anywhere whitespace-pre-wrap text-fg-2">
        {row.text}
      </p>
    </div>
  );
}

function RetryContent({ row }: { row: Extract<TimelineRowData, { kind: "retry" }> }) {
  return (
    <span className="block w-full min-w-0 truncate text-12">
      <span className="font-medium text-status-warning">
        重试 {row.attempt}/{row.max}
      </span>
      <span className="text-fg-3"> · </span>
      <span className="text-fg-2" title={row.message}>
        {row.message}
      </span>
    </span>
  );
}

function ErrorContent({ row }: { row: Extract<TimelineRowData, { kind: "error" }> }) {
  return (
    <p
      className="m-0 line-clamp-4 w-full min-w-0 text-13 wrap-anywhere whitespace-pre-wrap text-fg-1"
      title={row.message}
    >
      {row.message}
    </p>
  );
}

function OutputContent({ row }: { row: Extract<TimelineRowData, { kind: "output" }> }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-0.5" title={row.text}>
      <span className="font-mono text-11 text-fg-3">{row.stream}</span>
      <p className="m-0 line-clamp-4 min-w-0 font-mono text-12 wrap-anywhere whitespace-pre-wrap text-fg-2">
        {row.text}
      </p>
    </div>
  );
}
