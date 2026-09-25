import type { StatsQuery, TasksQuery } from "@fleet/core";
import {
  keepPreviousData,
  QueryClient,
  type QueryKey,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createContext, useContext, useEffect } from "react";
import { toast } from "sonner";
import type { DataSource } from "@/api/dataSource";
import { activitySignature } from "@/lib/activity";
import { useSnapshotStore } from "@/state/snapshotStore";

export const DataSourceContext = createContext<DataSource | null>(null);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
      refetchOnWindowFocus: false,
    },
  },
});

export function useDataSource(): DataSource {
  const dataSource = useContext(DataSourceContext);
  if (dataSource === null) {
    throw new Error("DataSourceContext is missing");
  }
  return dataSource;
}

export function useStats(query: StatsQuery) {
  const dataSource = useDataSource();
  return useQuery({
    queryKey: ["stats", query],
    queryFn: () => dataSource.getStats(query),
    placeholderData: keepPreviousData,
  });
}

export function useTasks(query: Omit<TasksQuery, "cursor">) {
  const dataSource = useDataSource();
  return useInfiniteQuery({
    queryKey: ["tasks", query],
    queryFn: ({ pageParam }) =>
      dataSource.getTasks({
        ...query,
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useProjects() {
  const dataSource = useDataSource();
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => dataSource.getProjects(),
    staleTime: 60_000,
  });
}

export function useSetPoolEnabled() {
  const dataSource = useDataSource();
  return useMutation({
    mutationFn: ({ poolId, enabled }: { poolId: string; enabled: boolean }) =>
      dataSource.setPoolEnabled(poolId, enabled),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "修改模型池失败");
    },
  });
}

export function useReorderPools() {
  const dataSource = useDataSource();
  return useMutation({
    mutationFn: (poolIds: readonly string[]) => dataSource.reorderPools(poolIds),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "调整模型池顺序失败");
    },
  });
}

interface ThrottledInvalidation {
  schedule(): void;
  cancel(): void;
}

function createThrottledInvalidation(
  client: QueryClient,
  queryKey: QueryKey,
  intervalMs: number,
): ThrottledInvalidation {
  let lastRun = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule() {
      if (timer !== null) {
        return;
      }
      const delay = Math.max(0, intervalMs - (Date.now() - lastRun));
      const invalidate = () => {
        timer = null;
        lastRun = Date.now();
        void client.invalidateQueries({ queryKey });
      };
      if (delay === 0) {
        invalidate();
      } else {
        timer = setTimeout(invalidate, delay);
      }
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

export function useLiveInvalidation(): void {
  const client = useQueryClient();

  useEffect(() => {
    const stats = createThrottledInvalidation(client, ["stats"], 5000);
    const tasks = createThrottledInvalidation(client, ["tasks"], 2000);
    const projects = createThrottledInvalidation(client, ["projects"], 30_000);
    const initialSnapshot = useSnapshotStore.getState().snapshot;
    let signature = initialSnapshot === null ? null : activitySignature(initialSnapshot);

    const unsubscribe = useSnapshotStore.subscribe((state) => {
      if (state.snapshot === null) {
        return;
      }
      const nextSignature = activitySignature(state.snapshot);
      if (nextSignature === signature) {
        return;
      }
      signature = nextSignature;
      stats.schedule();
      tasks.schedule();
      projects.schedule();
    });

    return () => {
      unsubscribe();
      stats.cancel();
      tasks.cancel();
      projects.cancel();
    };
  }, [client]);
}
