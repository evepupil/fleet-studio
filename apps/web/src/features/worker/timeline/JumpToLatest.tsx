import { ArrowDown } from "lucide-react";
import styles from "./JumpToLatest.module.css";

const { root } = styles;

export interface JumpToLatestProps {
  count: number;
  onClick(): void;
}

/** 「回到最新」：不在底部时新行会累计成这个按钮，点击后滚回时间线底部并清零未读数。 */
export function JumpToLatest({ count, onClick }: JumpToLatestProps) {
  return (
    <button type="button" className={root} data-jump-latest onClick={onClick}>
      <ArrowDown aria-hidden size={12} />
      回到最新 · {count} 条
    </button>
  );
}
