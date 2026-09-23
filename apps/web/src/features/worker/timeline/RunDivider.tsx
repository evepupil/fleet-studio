import { StatusBadge } from "../../../components/StatusBadge";
import { formatClock } from "../../../lib/format";
import type { TimelineRow as TimelineRowData } from "../../../lib/timelineView";
import styles from "./RunDivider.module.css";

const { root, line, label, rule, quote, quoteText, toggle } = styles;

type RunDividerRow = Extract<TimelineRowData, { kind: "run" }>;

export interface RunDividerProps {
  row: RunDividerRow;
  now: number;
  expanded: boolean;
  onToggle(key: string): void;
}

/** 超过这个行数才折叠追加指令引用块 */
const QUOTE_MAX_LINES = 6;

/**
 * 运行分隔行：开始/结束各一条「文字 + 填满剩余宽度的横线」。
 * 第 2 次及以后的运行，开始行下面跟一段可折叠的追加指令引用块。
 */
export function RunDivider({ row, now, expanded, onToggle }: RunDividerProps) {
  const overflow = row.edge === "start" && row.prompt.split("\n").length > QUOTE_MAX_LINES;

  return (
    <div className={root}>
      <div className={line}>
        <span className={label}>
          {row.edge === "start" ? (
            <>
              第 {row.runSeq} 次运行 · {formatClock(row.at, now)}
            </>
          ) : (
            <>
              第 {row.runSeq} 次运行结束 <StatusBadge size="sm" status={row.status} />
              {row.message !== null && <> · {row.message}</>}
            </>
          )}
        </span>
        <span className={rule} aria-hidden />
      </div>
      {row.edge === "start" && row.runSeq > 1 && (
        <div className={quote}>
          <p className={quoteText} data-expanded={expanded ? "true" : "false"}>
            {row.prompt}
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
      )}
    </div>
  );
}
