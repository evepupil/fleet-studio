import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";
import { formatClock, formatShortDuration } from "@/lib/format";
import type { TimelineRow as TimelineRowData } from "@/lib/timelineView";
import { toolIcon } from "@/lib/tools";

type ToolRowData = Extract<TimelineRowData, { kind: "tool" }>;

export interface ToolRowProps {
  row: ToolRowData;
  now: number;
  expanded: boolean;
  onToggle(key: string): void;
  /** 结果为空、苦工在工作中、且这是全部工具行里最后一个时才转圈，由上层算好传进来 */
  spinning: boolean;
}

/** 整行按钮和展开面板共用同一套四列网格，面板内容整体放进第 3、4 列，靠网格留白对齐。 */
const GRID_CLASS =
  "grid grid-cols-[56px_16px_minmax(0,1fr)] items-start gap-x-2.5 lg:grid-cols-[64px_16px_minmax(0,1fr)_auto]";

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
        className={`${GRID_CLASS} w-full rounded-sm py-1.5 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] enabled:hover:bg-hover`}
        aria-expanded={expanded}
        aria-controls={hasPanel ? panelId : undefined}
        disabled={!hasPanel}
        onClick={() => onToggle(row.key)}
      >
        <span className="font-mono text-12 text-fg-3">{formatClock(row.at, now)}</span>
        <Icon aria-hidden size={14} className="mt-[3px] text-fg-2" />
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-mono text-12 text-fg-2">{row.tool}</span>
          <span className="min-w-0 truncate font-mono text-13 text-fg-1" title={row.summary}>
            {row.summary}
          </span>
        </span>
        <span className="col-start-3 row-start-2 mt-0.5 flex items-center gap-1 self-start justify-self-start lg:col-start-4 lg:row-start-1 lg:mt-0">
          {renderRight(row, spinning)}
        </span>
      </button>
      {expanded && hasPanel && (
        <div className={`${GRID_CLASS} pb-1.5`} id={panelId}>
          <div className="col-start-3 col-end-4 flex min-w-0 flex-col gap-2 lg:col-end-5">
            {row.detail !== null && (
              <div>
                <div className="mb-1 text-11 text-fg-3">参数</div>
                {/* 数据属性取值用完整字符串，不用布尔值：React 对 false 会整个不渲染属性 */}
                <pre
                  data-failed="false"
                  className="m-0 max-h-[240px] overflow-auto rounded-md border border-line bg-raised px-2.5 py-2 font-mono text-12 break-all whitespace-pre-wrap text-fg-2"
                >
                  {row.detail}
                </pre>
              </div>
            )}
            {row.result !== null && (
              <div>
                <div className="mb-1 text-11 text-fg-3">
                  结果{row.result.truncated ? "（已截断）" : ""}
                </div>
                <pre
                  data-failed={row.result.ok ? "false" : "true"}
                  className={`m-0 max-h-[240px] overflow-auto rounded-md border bg-raised px-2.5 py-2 font-mono text-12 break-all whitespace-pre-wrap text-fg-2 ${row.result.ok ? "border-line" : "border-line border-l-2 border-l-status-failed"}`}
                >
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
          <LoaderCircle
            aria-hidden
            size={12}
            className="animate-spin-slow text-status-running motion-reduce:hidden"
          />
          {/* 减少动态效果时把转圈换成 8px 实心圆点（DESIGN.md 第 3 章） */}
          <span
            aria-hidden
            className="hidden size-2 rounded-full bg-status-running motion-reduce:inline-block"
          />
        </>
      );
    }
    return <span className="font-mono text-12 text-fg-3">—</span>;
  }
  if (row.result.ok) {
    return (
      <>
        <CircleCheck aria-hidden size={12} className="text-status-done" />
        {row.durationMs !== null && (
          <span className="font-mono text-12 text-fg-3">{formatShortDuration(row.durationMs)}</span>
        )}
      </>
    );
  }
  return (
    <>
      <CircleX aria-hidden size={12} className="text-status-failed" />
      <span className="text-12 text-status-failed">失败</span>
    </>
  );
}
