import { elapsedMs, formatDuration } from "../lib/format";
import { useNow } from "../state/nowStore";
import styles from "./Duration.module.css";

const { root } = styles;

export interface DurationProps {
  from: string | null;
  to?: string | null;
}

/** 已耗时长：to 为空时跟着全站唯一的时钟实时刷新；from 为空说明还没开始，显示占位符。 */
export function Duration({ from, to = null }: DurationProps) {
  const now = useNow();
  if (from === null) {
    return <span className={root}>—</span>;
  }
  const ms = elapsedMs(from, to, now);
  return <span className={root}>{ms === null ? "—" : formatDuration(ms)}</span>;
}
