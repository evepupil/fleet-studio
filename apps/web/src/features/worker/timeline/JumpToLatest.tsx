import { ArrowDown } from "lucide-react";

export interface JumpToLatestProps {
  count: number;
  onClick(): void;
}

/** 「回到最新」：不在底部时新行会累计成这个按钮，点击后滚回时间线底部并清零未读数。 */
export function JumpToLatest({ count, onClick }: JumpToLatestProps) {
  return (
    <button
      type="button"
      data-jump-latest
      onClick={onClick}
      className="sticky bottom-4 flex h-7 items-center gap-1 self-end rounded-md bg-brand px-3 text-12 font-medium whitespace-nowrap text-on-brand transition duration-[var(--dur-fast)] ease-[var(--ease)] hover:brightness-110 active:brightness-95"
    >
      <ArrowDown aria-hidden size={12} />
      回到最新 · {count} 条
    </button>
  );
}
