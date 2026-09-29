import { StatusIcon } from "@/components/StatusIcon";
import type { CollapsibleColumn } from "@/lib/board";
import { STATUS_META } from "@/lib/status";

interface TaskBoardEndedProps {
  statuses: CollapsibleColumn[];
  counts: Record<CollapsibleColumn, number>;
  onExpand(status: CollapsibleColumn): void;
}

const COUNT_TONE: Record<CollapsibleColumn, { populated: string; empty: string }> = {
  failed: {
    populated: "ml-auto text-13 font-medium text-status-failed",
    empty: "ml-auto text-13 text-fg-3",
  },
  cancelled: {
    populated: "ml-auto text-13 text-fg-3",
    empty: "ml-auto text-13 text-fg-3",
  },
};

function TaskBoardEnded({ statuses, counts, onExpand }: TaskBoardEndedProps) {
  return (
    <aside
      data-ended-group
      aria-label="收起的状态"
      className="flex w-[var(--ended-col-w)] shrink-0 flex-col gap-2 max-md:snap-start"
    >
      {statuses.map((status) => {
        const label = STATUS_META[status].label;
        const count = counts[status];
        const countTone = COUNT_TONE[status][count > 0 ? "populated" : "empty"];

        return (
          <button
            type="button"
            key={status}
            data-ended-row={status}
            data-count={count}
            aria-label={`展开${label}，${count} 个`}
            className="flex h-9 w-full items-center gap-2 rounded-lg bg-column px-3 text-left transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            onClick={() => onExpand(status)}
          >
            <StatusIcon status={status} size={14} />
            <span className="min-w-0 truncate text-13 font-medium text-fg-1">{label}</span>
            <span data-ended-count className={countTone}>
              {count}
            </span>
          </button>
        );
      })}
    </aside>
  );
}

export { TaskBoardEnded };
