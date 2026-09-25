import type { TaskSortKey, WorkerSummary } from "@fleet/core";
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { useProjects, useTasks } from "@/api/queries";
import { EmptyState, ErrorState } from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TaskTableLoading } from "@/features/tasks/TaskTableLoading";
import { TaskTableRow } from "@/features/tasks/TaskTableRow";
import { mergeLiveSummaries } from "@/lib/liveMerge";
import { toTasksQuery } from "@/lib/taskFilters";
import { useNow } from "@/state/nowStore";
import { useSnapshotStore } from "@/state/snapshotStore";
import { useTaskFilterStore } from "@/state/taskFilterStore";

interface TaskTableProps {
  compact: boolean;
  selectedId: string | null;
}

const SORTABLE_COLUMNS: { key: TaskSortKey; label: string }[] = [
  { key: "tokens", label: "用量" },
  { key: "runMs", label: "耗时" },
  { key: "createdAt", label: "开始时间" },
];

const SORT_HEADER_CLASSES: Readonly<Record<TaskSortKey, string>> = {
  tokens: "w-[96px] text-right text-12 font-medium text-fg-3",
  runMs: "w-[96px] text-right text-12 font-medium text-fg-3",
  createdAt: "w-[112px] text-right text-12 font-medium text-fg-3",
};

function SortHeader({ column }: { column: (typeof SORTABLE_COLUMNS)[number] }) {
  const filters = useTaskFilterStore((state) => state);
  const setFilters = useTaskFilterStore((state) => state.set);
  const active = filters.sort === column.key;
  const ariaSort = !active ? "none" : filters.order === "desc" ? "descending" : "ascending";
  const DirectionIcon = active ? (filters.order === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;

  function toggleSort(): void {
    if (!active) {
      setFilters({ sort: column.key, order: "desc" });
      return;
    }
    setFilters({ order: filters.order === "desc" ? "asc" : "desc" });
  }

  return (
    <TableHead
      aria-sort={ariaSort}
      data-sort={column.key}
      className={SORT_HEADER_CLASSES[column.key]}
    >
      <button
        type="button"
        className="inline-flex w-full items-center justify-end gap-1 text-fg-2 hover:text-fg-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        onClick={toggleSort}
      >
        {column.label}
        <DirectionIcon
          aria-hidden="true"
          className={`size-3.5 ${active ? "text-fg-1" : "text-fg-3"}`}
        />
      </button>
    </TableHead>
  );
}

function TaskTable({ compact, selectedId }: TaskTableProps) {
  const filters = useTaskFilterStore((state) => state);
  const setFilters = useTaskFilterStore((state) => state.set);
  const resetFilters = useTaskFilterStore((state) => state.reset);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const projects = useProjects();
  const nowMs = useNow();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const queryParams = useMemo(() => toTasksQuery(filters), [filters]);
  const observerQueryRef = useRef<typeof queryParams | null>(null);
  const taskQuery = useTasks(queryParams);
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = taskQuery;
  const queryItems = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  // 快照优先提供重复编号的较新摘要，再投影回接口顺序，避免扩大服务端筛选结果或改变分页顺序。
  const items = useMemo(() => {
    if (snapshot === null) return queryItems;
    const merged = mergeLiveSummaries(snapshot.workers, queryItems);
    const preferredById = new Map<string, WorkerSummary>();
    for (const item of merged) preferredById.set(item.id, item);
    return queryItems.map((item) => preferredById.get(item.id) ?? item);
  }, [queryItems, snapshot]);

  const projectNames = new Map<string, string>();
  const projectColors = new Map<string, number>();
  for (const project of snapshot?.projects ?? []) {
    projectNames.set(project.key, project.name);
    projectColors.set(project.key, project.colorIndex);
  }
  for (const project of projects.data ?? []) {
    projectNames.set(project.key, project.name);
    projectColors.set(project.key, project.colorIndex);
  }

  // 查询参数变化时释放旧观察器；root 固定为本表自己的滚动容器。
  useEffect(() => {
    const root = scrollRef.current;
    const target = loadMoreRef.current;
    if (root === null || target === null) return;
    observerQueryRef.current = queryParams;
    const observedQuery = queryParams;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          observerQueryRef.current === observedQuery &&
          entries.some((entry) => entry.isIntersecting) &&
          hasNextPage &&
          !isFetchingNextPage
        ) {
          void fetchNextPage();
        }
      },
      { root, rootMargin: "200px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [queryParams, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const isInitialLoading = isLoading || (data === undefined && !isError);
  const isInitialError = isError && data === undefined;
  const isEmpty = !isInitialLoading && !isInitialError && items.length === 0;
  const noOtherFilters =
    filters.project === undefined &&
    filters.pool === undefined &&
    filters.role === undefined &&
    filters.channel === undefined &&
    filters.model === undefined &&
    filters.range.kind === "all" &&
    filters.q.trim().length === 0;
  const defaultActiveFilters = filters.status === "active" && noOtherFilters;
  const allTasksFilters = filters.status === "all" && noOtherFilters;
  const total = data?.pages[0]?.total ?? 0;
  const selectedClass = compact && selectedId !== null ? "hidden lg:flex" : "";

  return (
    <TooltipProvider>
      <section
        data-task-table
        data-compact={compact ? "true" : "false"}
        className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-panel ${selectedClass}`}
      >
        <div ref={scrollRef} data-task-scroll className="min-h-0 flex-1 overflow-auto">
          {isInitialError ? (
            <ErrorState
              message={error instanceof Error ? error.message : String(error)}
              onRetry={() => void refetch()}
            />
          ) : isEmpty ? (
            defaultActiveFilters ? (
              <EmptyState
                icon={Inbox}
                message="没有进行中的任务"
                action={{ label: "查看全部", onClick: () => setFilters({ status: "all" }) }}
              />
            ) : allTasksFilters ? (
              <EmptyState message="还没有任务" command={'fleet run "任务"'} />
            ) : (
              <EmptyState
                message="没有符合条件的任务"
                action={{ label: "清除筛选", onClick: resetFilters }}
              />
            )
          ) : (
            <Table className={compact ? "w-full" : "min-w-[960px]"}>
              {!compact ? (
                <TableHeader className="sticky top-0 z-[var(--z-sticky)] bg-panel">
                  <TableRow className="hover:bg-panel">
                    <TableHead className="min-w-[280px] text-12 font-medium text-fg-3">
                      标题
                    </TableHead>
                    <TableHead className="w-[160px] text-12 font-medium text-fg-3">项目</TableHead>
                    <TableHead className="w-[96px] text-12 font-medium text-fg-3">角色</TableHead>
                    <TableHead className="w-[96px] text-12 font-medium text-fg-3">池</TableHead>
                    <TableHead className="min-w-[180px] text-12 font-medium text-fg-3">
                      状态
                    </TableHead>
                    {SORTABLE_COLUMNS.map((column) => (
                      <SortHeader key={column.key} column={column} />
                    ))}
                  </TableRow>
                </TableHeader>
              ) : null}
              {isInitialLoading ? (
                <TaskTableLoading compact={compact} count={8} />
              ) : (
                <TableBody>
                  {items.map((item) => (
                    <TaskTableRow
                      key={item.id}
                      item={item}
                      compact={compact}
                      selected={item.id === selectedId}
                      projectName={projectNames.get(item.projectKey) ?? item.projectKey}
                      projectColorIndex={projectColors.get(item.projectKey)}
                      nowMs={nowMs}
                      onOpen={(id) => navigate(`/tasks/${id}`)}
                    />
                  ))}
                  {isFetchingNextPage ? <TaskTableLoading compact={compact} count={3} /> : null}
                  {!hasNextPage && items.length > 0 ? (
                    <TableRow>
                      <TableCell
                        data-task-total
                        colSpan={compact ? 1 : 8}
                        className="py-3 text-center text-12 text-fg-3"
                      >
                        共 {total} 个
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              )}
            </Table>
          )}
          <div ref={loadMoreRef} data-load-more className="h-px" />
        </div>
      </section>
    </TooltipProvider>
  );
}

export { TaskTable };
