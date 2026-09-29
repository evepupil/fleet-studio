import type { RunStatus, WorkerSummary } from "@fleet/core";
import { Inbox } from "lucide-react";
import { useMemo } from "react";
import { EmptyState } from "@/components/EmptyState";
import { TaskBoardColumn } from "@/features/board/TaskBoardColumn";
import { TaskBoardEnded } from "@/features/board/TaskBoardEnded";
import { TaskBoardSkeleton } from "@/features/board/TaskBoardSkeleton";
import { useTaskBoardKeys } from "@/features/board/useTaskBoardKeys";
import {
  boardLayout,
  filterBoardWorkers,
  groupBoardColumns,
  isCollapsibleColumn,
} from "@/lib/board";
import { useBoardStore } from "@/state/boardStore";
import { useDisplayStore } from "@/state/displayStore";
import { useSnapshotStore } from "@/state/snapshotStore";
import { useTaskFilterStore } from "@/state/taskFilterStore";

const EMPTY_WORKERS: readonly WorkerSummary[] = [];

function TaskBoard() {
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const project = useTaskFilterStore((state) => state.project);
  const pool = useTaskFilterStore((state) => state.pool);
  const role = useTaskFilterStore((state) => state.role);
  const channel = useTaskFilterStore((state) => state.channel);
  const model = useTaskFilterStore((state) => state.model);
  const q = useTaskFilterStore((state) => state.q);
  const reset = useTaskFilterStore((state) => state.reset);
  const expanded = useBoardStore((state) => state.expanded);
  const toggleExpanded = useBoardStore((state) => state.toggleExpanded);
  const cardProps = useDisplayStore((state) => state.cardProps);
  const handleArrowKeys = useTaskBoardKeys();

  const all = snapshot?.workers ?? EMPTY_WORKERS;
  const filtered = useMemo(
    () => filterBoardWorkers(all, { project, pool, role, channel, model, q }),
    [all, project, pool, role, channel, model, q],
  );
  const groupedColumns = useMemo(() => groupBoardColumns(filtered), [filtered]);
  const layout = boardLayout(expanded);

  if (snapshot === null) {
    return <TaskBoardSkeleton />;
  }

  if (snapshot.workers.length === 0) {
    return (
      <div
        data-board
        data-empty-board
        className="flex h-full min-w-0 items-center justify-center p-6"
      >
        <EmptyState icon={Inbox} message="还没有任务" command={'fleet run "任务"'} />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div
        data-board
        data-empty-board
        className="flex h-full min-w-0 items-center justify-center p-6"
      >
        <EmptyState message="没有符合条件的任务" action={{ label: "清除筛选", onClick: reset }} />
      </div>
    );
  }

  // boardStore 负责持久化展开状态；layout 按固定顺序插入展开列并收起对应短条。
  const handleToggleExpanded = (status: RunStatus) => {
    if (status === "failed" || status === "cancelled") {
      toggleExpanded(status);
    }
  };

  const counts = {
    failed: groupedColumns.failed.length,
    cancelled: groupedColumns.cancelled.length,
  };

  return (
    <section
      data-board
      aria-label="任务看板"
      className="flex h-full min-h-0 min-w-0 gap-2 overflow-x-auto overflow-y-hidden p-2 max-md:snap-x max-md:snap-mandatory"
      onKeyDown={handleArrowKeys}
    >
      {layout.columns.map((status) => (
        <TaskBoardColumn
          key={status}
          status={status}
          items={groupedColumns[status]}
          collapsible={isCollapsibleColumn(status)}
          onCollapse={() => handleToggleExpanded(status)}
          cardProps={cardProps}
        />
      ))}
      {layout.collapsed.length > 0 ? (
        <TaskBoardEnded statuses={layout.collapsed} counts={counts} onExpand={toggleExpanded} />
      ) : null}
    </section>
  );
}

export { TaskBoard };
