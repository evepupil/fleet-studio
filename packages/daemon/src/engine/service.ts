import type {
  HealthInfo,
  ListWorkersQuery,
  PoolPatch,
  PoolView,
  RoleView,
  SendRequest,
  Snapshot,
  SubmitRequest,
  TimelineEvent,
  TimelinePage,
  WaitResult,
  WorkerDetail,
  WorkerSummary,
} from "@fleet/core";

/**
 * 调度引擎对接口层暴露的服务契约。接口层只依赖这里，测试时可以换成假服务。
 * 出错一律抛 FleetError，由接口层转成 HTTP 状态码。
 */

export type ServiceEvent =
  /** 快照可能变了（接口层自己节流后再取快照） */
  | { type: "snapshot" }
  /** 某苦工时间线新增了事件（按 seq 升序、连续） */
  | { type: "timeline"; workerId: string; events: TimelineEvent[] }
  /** 某苦工的详情变了（状态、用量、最近活动等） */
  | { type: "worker"; workerId: string };

export type WaitMode = "all" | "any";

export interface FleetService {
  health(): HealthInfo;
  snapshot(): Snapshot;
  listWorkers(query: ListWorkersQuery): WorkerSummary[];
  /** 不存在返回 null */
  getWorker(id: string): WorkerDetail | null;
  /** 返回 seq > after 的最多 limit 条事件；苦工不存在返回 null */
  timeline(id: string, after: number, limit: number): Promise<TimelinePage | null>;
  submit(request: SubmitRequest): Promise<WorkerSummary>;
  /** 对已结束的苦工追加指令；苦工还在排队或工作中抛 FleetError("conflict") */
  send(id: string, request: SendRequest): Promise<WorkerSummary>;
  /** 取消苦工；已经是终态时原样返回，不报错 */
  cancel(id: string): Promise<WorkerSummary>;
  /**
   * 等苦工结束：mode 为 all 时全部结束才返回，any 时任一结束就返回；
   * 超过 timeoutMs 或 signal 触发时返回当前情况（timedOut 为 true）。
   * 不存在的编号抛 FleetError("not_found")。
   */
  wait(ids: readonly string[], mode: WaitMode, timeoutMs: number, signal: AbortSignal): Promise<WaitResult>;
  pools(): PoolView[];
  patchPool(id: string, patch: PoolPatch): Promise<PoolView>;
  roles(): RoleView[];
  /** 订阅事件，返回取消订阅函数 */
  subscribe(listener: (event: ServiceEvent) => void): () => void;
  /** 让服务优雅退出（接口层在响应发出后调用） */
  requestShutdown(): void;
}
