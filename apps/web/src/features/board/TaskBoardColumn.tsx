import type { RunStatus, WorkerSummary } from "@fleet/core";
import { ChevronsRight } from "lucide-react";
import { StatusIcon } from "@/components/StatusIcon";
import { Button } from "@/components/ui/button";
import { TaskBoardCard } from "@/features/board/TaskBoardCard";
import { STATUS_META } from "@/lib/status";
import type { CardProp } from "@/state/displayStore";

interface TaskBoardColumnProps {
  status: RunStatus;
  items: WorkerSummary[];
  collapsible: boolean;
  onCollapse(): void;
  cardProps: Record<CardProp, boolean>;
}

function TaskBoardColumn({
  status,
  items,
  collapsible,
  onCollapse,
  cardProps,
}: TaskBoardColumnProps) {
  const label = STATUS_META[status].label;

  return (
    <section
      data-board-column={status}
      data-count={items.length}
      aria-label={`${label} ${items.length} 个`}
      className="flex h-full min-h-0 min-w-[var(--board-col-min)] flex-1 basis-0 flex-col rounded-lg bg-column max-md:min-w-[280px] max-md:snap-start"
    >
      <header className="flex h-9 shrink-0 items-center gap-2 pl-3 pr-1.5">
        <StatusIcon status={status} size={14} />
        <h2 className="truncate text-13 font-medium text-fg-1">{label}</h2>
        <span data-column-count className="text-13 text-fg-3">
          {items.length}
        </span>
        {collapsible ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            data-collapse-column={status}
            aria-label={`收起${label}`}
            title={`收起${label}`}
            onClick={onCollapse}
          >
            <ChevronsRight aria-hidden="true" className="size-3.5" />
          </Button>
        ) : null}
      </header>
      <div
        data-column-body
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2"
      >
        {items.map((worker) => (
          <TaskBoardCard key={worker.id} worker={worker} props={cardProps} />
        ))}
      </div>
    </section>
  );
}

export { TaskBoardColumn };
