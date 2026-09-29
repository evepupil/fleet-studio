import { Skeleton } from "@/components/ui/skeleton";

function TaskBoardSkeleton() {
  return (
    <div
      data-board
      data-loading="true"
      className="flex h-full min-h-0 min-w-0 gap-2 overflow-x-auto overflow-y-hidden p-2 max-md:snap-x max-md:snap-mandatory"
    >
      {[0, 1, 2].map((column) => (
        <section
          key={column}
          aria-hidden="true"
          className="flex h-full min-h-0 min-w-[var(--board-col-min)] flex-1 basis-0 flex-col rounded-lg bg-column max-md:min-w-[280px] max-md:snap-start"
        >
          <header className="flex h-9 shrink-0 items-center gap-2 pl-3 pr-1.5">
            <Skeleton className="h-3.5 w-16" />
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-2 pb-2">
            {[0, 1, 2].map((card) => (
              <Skeleton key={card} className="h-[88px] w-full rounded-lg" />
            ))}
          </div>
        </section>
      ))}
      <aside
        aria-hidden="true"
        className="flex w-[var(--ended-col-w)] shrink-0 flex-col gap-2 max-md:snap-start"
      >
        {[0, 1].map((row) => (
          <Skeleton key={row} className="h-9 w-full rounded-lg" />
        ))}
      </aside>
    </div>
  );
}

export { TaskBoardSkeleton };
