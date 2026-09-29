import type { WorkerSummary } from "@fleet/core";
import { Inbox } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router";
import { useTasks } from "@/api/queries";
import { EmptyState, ErrorState } from "@/components";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TaskListRow } from "@/features/tasks/TaskListRow";
import { TaskListSkeleton } from "@/features/tasks/TaskListSkeleton";
import { mergeLiveSummaries } from "@/lib/liveMerge";
import { hasActiveFilters, toTasksQuery } from "@/lib/taskFilters";
import { useNow } from "@/state/nowStore";
import { useSnapshotStore } from "@/state/snapshotStore";
import { useTaskFilterStore } from "@/state/taskFilterStore";

function TaskList() {
  const filters = useTaskFilterStore((state) => state);
  const reset = useTaskFilterStore((state) => state.reset);
  const snapshot = useSnapshotStore((state) => state.snapshot);
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

  // 快照覆盖重复编号的旧摘要后，再投影回接口顺序，保留服务端筛选结果和分页顺序。
  const items = useMemo(() => {
    if (snapshot === null) return queryItems;
    const merged = mergeLiveSummaries(snapshot.workers, queryItems);
    const preferredById = new Map<string, WorkerSummary>();
    for (const item of merged) preferredById.set(item.id, item);
    return queryItems.map((item) => preferredById.get(item.id) ?? item);
  }, [queryItems, snapshot]);

  // 每次查询参数改变都会替换观察器，且只观察列表自身滚动区里的加载锚点。
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
  const total = data?.pages[0]?.total ?? 0;

  return (
    <div data-task-list ref={scrollRef} className="h-full overflow-auto">
      <TooltipProvider>
        {isInitialError ? (
          <div className="flex h-full items-center justify-center">
            <ErrorState
              message={error instanceof Error ? error.message : String(error)}
              onRetry={() => void refetch()}
            />
          </div>
        ) : isEmpty ? (
          <div className="flex h-full items-center justify-center">
            {hasActiveFilters(filters, "list") ? (
              <EmptyState
                message="没有符合条件的任务"
                action={{ label: "清除筛选", onClick: reset }}
              />
            ) : (
              <EmptyState icon={Inbox} message="还没有任务" command={'fleet run "任务"'} />
            )}
          </div>
        ) : (
          <table className="w-full table-fixed border-collapse text-13">
            <thead className="sticky top-0 z-[var(--z-sticky)] bg-panel">
              <tr>
                <th
                  scope="col"
                  className="h-8 w-10 border-b border-line px-2 pl-4 text-left text-12 font-medium text-fg-3"
                >
                  <span className="sr-only">状态</span>
                </th>
                <th
                  scope="col"
                  className="hidden h-8 w-[76px] border-b border-line px-2 text-left text-12 font-medium text-fg-3 md:table-cell"
                >
                  编号
                </th>
                <th
                  scope="col"
                  className="h-8 border-b border-line px-2 text-left text-12 font-medium text-fg-3"
                >
                  标题
                </th>
                <th
                  scope="col"
                  className="hidden h-8 w-[160px] border-b border-line px-2 text-left text-12 font-medium text-fg-3 md:table-cell"
                >
                  项目
                </th>
                <th
                  scope="col"
                  className="hidden h-8 w-20 border-b border-line px-2 text-left text-12 font-medium text-fg-3 xl:table-cell"
                >
                  角色
                </th>
                <th
                  scope="col"
                  className="hidden h-8 w-20 border-b border-line px-2 text-left text-12 font-medium text-fg-3 lg:table-cell"
                >
                  池
                </th>
                <th
                  scope="col"
                  className="hidden h-8 w-20 border-b border-line px-2 text-right text-12 font-medium text-fg-3 lg:table-cell"
                >
                  用量
                </th>
                <th
                  scope="col"
                  className="hidden h-8 w-20 border-b border-line px-2 text-right text-12 font-medium text-fg-3 md:table-cell"
                >
                  耗时
                </th>
                <th
                  scope="col"
                  className="h-8 w-[104px] border-b border-line px-2 pr-4 text-right text-12 font-medium text-fg-3"
                >
                  开始时间
                </th>
              </tr>
            </thead>
            {isInitialLoading ? (
              <tbody>
                <TaskListSkeleton count={10} />
              </tbody>
            ) : (
              <tbody>
                {items.map((item) => (
                  <TaskListRow
                    key={item.id}
                    item={item}
                    nowMs={nowMs}
                    onOpen={(id) => navigate(`/tasks/${id}`)}
                  />
                ))}
                {isFetchingNextPage ? <TaskListSkeleton count={3} /> : null}
                {!hasNextPage && items.length > 0 ? (
                  <tr>
                    <td colSpan={9} data-task-total className="h-10 text-center text-12 text-fg-3">
                      共 {total} 个
                    </td>
                  </tr>
                ) : null}
              </tbody>
            )}
          </table>
        )}
        <div ref={loadMoreRef} data-load-more className="h-px" />
      </TooltipProvider>
    </div>
  );
}

export { TaskList };
