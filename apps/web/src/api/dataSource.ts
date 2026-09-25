import type {
  PoolView,
  ProjectInfo,
  Snapshot,
  StatsQuery,
  StatsResponse,
  TaskPage,
  TasksQuery,
  TimelineEvent,
  WorkerDetail,
} from "@fleet/core";

export type ConnectionState = "connecting" | "open" | "lost";

export interface WorkerHandlers {
  onDetail(detail: WorkerDetail): void;
  onEvents(events: TimelineEvent[]): void;
  onNotFound(): void;
  onError(message: string): void;
}

export interface DataSource {
  subscribeSnapshot(
    onSnapshot: (snapshot: Snapshot) => void,
    onConnection: (connection: ConnectionState) => void,
  ): () => void;
  subscribeWorker(id: string, after: number, handlers: WorkerHandlers): () => void;
  fixedNow(): number | null;
  getStats(query: StatsQuery): Promise<StatsResponse>;
  getTasks(query: TasksQuery): Promise<TaskPage>;
  getProjects(): Promise<ProjectInfo[]>;
  setPoolEnabled(poolId: string, enabled: boolean): Promise<PoolView>;
  reorderPools(poolIds: readonly string[]): Promise<PoolView[]>;
}
