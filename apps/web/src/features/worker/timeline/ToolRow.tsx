import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { formatClock, formatShortDuration } from "../../../lib/format";
import type { TimelineRow as TimelineRowData } from "../../../lib/timelineView";
import { toolIcon } from "../../../lib/tools";
import styles from "./ToolRow.module.css";

const {
  button,
  time,
  icon,
  content,
  toolName,
  summary,
  right,
  statusText,
  statusFailed,
  iconDone,
  iconFailed,
  spin,
  reducedDot,
  panel,
  panelInner,
  label,
  codeBlock,
} = styles;

type ToolRowData = Extract<TimelineRowData, { kind: "tool" }>;

export interface ToolRowProps {
  row: ToolRowData;
  now: number;
  expanded: boolean;
  onToggle(key: string): void;
  /** 结果为空、苦工在工作中、且这是全部工具行里最后一个时才转圈，由上层算好传进来 */
  spinning: boolean;
}

/**
 * 工具行：整行是按钮，点击展开下方的参数/结果面板。
 * 面板复用同一套 4 列网格，把内容整体放进第 3、4 列，靠网格本身在第 1、2 列留白对齐，
 * 不用另外去量一个缩进距离。
 */
export function ToolRow({ row, now, expanded, onToggle, spinning }: ToolRowProps) {
  const Icon = toolIcon(row.tool);
  const hasPanel = row.detail !== null || row.result !== null;
  const panelId = `timeline-tool-panel-${row.key}`;

  return (
    <>
      <button
        type="button"
        className={button}
        aria-expanded={expanded}
        aria-controls={hasPanel ? panelId : undefined}
        disabled={!hasPanel}
        onClick={() => onToggle(row.key)}
      >
        <span className={time}>{formatClock(row.at, now)}</span>
        <Icon aria-hidden size={14} className={icon} />
        <span className={content}>
          <span className={toolName}>{row.tool}</span>
          <span className={summary} title={row.summary}>
            {row.summary}
          </span>
        </span>
        <span className={right}>{renderRight(row, spinning)}</span>
      </button>
      {expanded && hasPanel && (
        <div className={panel} id={panelId}>
          <div className={panelInner}>
            {row.detail !== null && (
              <div>
                <div className={label}>参数</div>
                <pre className={codeBlock} data-failed="false">
                  {row.detail}
                </pre>
              </div>
            )}
            {row.result !== null && (
              <div>
                <div className={label}>结果{row.result.truncated ? "（已截断）" : ""}</div>
                <pre className={codeBlock} data-failed={row.result.ok ? "false" : "true"}>
                  {row.result.preview}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function renderRight(row: ToolRowData, spinning: boolean) {
  if (row.result === null) {
    if (spinning) {
      return (
        <>
          <LoaderCircle aria-hidden size={12} className={spin} />
          <span className={reducedDot} aria-hidden />
        </>
      );
    }
    return <span className={statusText}>—</span>;
  }
  if (row.result.ok) {
    return (
      <>
        <CircleCheck aria-hidden size={12} className={iconDone} />
        {row.durationMs !== null && (
          <span className={statusText}>{formatShortDuration(row.durationMs)}</span>
        )}
      </>
    );
  }
  return (
    <>
      <CircleX aria-hidden size={12} className={iconFailed} />
      <span className={statusFailed}>失败</span>
    </>
  );
}
