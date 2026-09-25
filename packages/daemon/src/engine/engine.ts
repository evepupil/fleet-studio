import type {
  HealthInfo,
  ListWorkersQuery,
  PoolPatch,
  PoolView,
  ProjectInfo,
  RoleView,
  SendRequest,
  Snapshot,
  StatsQuery,
  StatsResponse,
  SubmitRequest,
  TaskPage,
  TasksQuery,
  TimelinePage,
  WaitResult,
  WorkerDetail,
  WorkerSummary,
} from "@fleet/core";
import { cancelWorker } from "./cancel.js";
import { createDispatcher } from "./dispatcher.js";
import { createEventBus } from "./events.js";
import { reorderPools, setPoolEnabled } from "./poolSettings.js";
import {
  getHealth,
  getWorkerDetail,
  listPools,
  listRoles,
  listWorkers,
  patchPool,
} from "./queries.js";
import { runRecovery } from "./recovery.js";
import { runRetentionSweep } from "./retention.js";
import type { ServiceEvent, WaitMode } from "./service.js";
import { createSnapshotService } from "./snapshotService.js";
import { queryStats } from "./statsQueries.js";
import { sendToWorker, submitWorker } from "./submit.js";
import { listProjects, queryTasks } from "./taskQueries.js";
import { createTimelineStore } from "./timelineStore.js";
import { runTimeoutSweep } from "./timeouts.js";
import type { Engine, EngineContext, EngineDeps } from "./types.js";
import { createWaiter } from "./waiter.js";

/** 放行兜底：正常情况下 requestDispatch 的 setImmediate 早就跑过了，这只是保底。 */
const DEFAULT_DISPATCH_FALLBACK_MS = 1000;
/** 跟踪：读输出、落库节流、ended 后 10 秒强杀，都在这个共享定时器里检查。 */
const DEFAULT_TRACKER_POLL_MS = 400;
/** 超时：工作中超时、排队超时，每秒检查一次。 */
const DEFAULT_TIMEOUT_SWEEP_MS = 1000;
/** 过期清理：启动时跑一次，之后每小时一次。 */
const DEFAULT_RETENTION_SWEEP_MS = 60 * 60 * 1000;

/**
 * 调度引擎：完整实现 FleetService，加上 start/stop 生命周期（模块设计 3.1）。
 * 这个文件只管「组装」——各部分的具体规则都在同目录的其它文件里，这里只把它们接起来、
 * 挂上定时器、把 FleetService 的每个方法转发给对应的实现。
 */
export function createEngine(deps: EngineDeps): Engine {
  const now = deps.now ?? Date.now;
  const events = createEventBus(deps.logger);
  const timelines = createTimelineStore({
    repos: deps.repos,
    paths: deps.paths,
    logger: deps.logger,
    events,
  });
  const snapshots = createSnapshotService({
    repos: deps.repos,
    config: deps.config,
    logger: deps.logger,
    version: deps.version,
    now,
  });
  const waiter = createWaiter({ repos: deps.repos, config: deps.config, events, now });

  const ctx: EngineContext = {
    deps,
    now,
    events,
    timelines,
    snapshots,
    waiter,
    trackers: new Map(),
    // 占位：dispatcher 依赖 ctx 才能构造，构造完成后立刻替换成真正的实现（下面紧接着就做）。
    requestDispatch: () => {},
    notifyWorker(workerId: string): void {
      events.emit({ type: "worker", workerId });
      snapshots.markDirty();
      events.emit({ type: "snapshot" });
    },
    notifySnapshot(): void {
      snapshots.markDirty();
      events.emit({ type: "snapshot" });
    },
  };

  const dispatcher = createDispatcher(ctx);
  ctx.requestDispatch = dispatcher.requestDispatch;

  const intervals = {
    dispatchFallbackMs: deps.intervals?.dispatchFallbackMs ?? DEFAULT_DISPATCH_FALLBACK_MS,
    trackerPollMs: deps.intervals?.trackerPollMs ?? DEFAULT_TRACKER_POLL_MS,
    timeoutSweepMs: deps.intervals?.timeoutSweepMs ?? DEFAULT_TIMEOUT_SWEEP_MS,
    retentionSweepMs: deps.intervals?.retentionSweepMs ?? DEFAULT_RETENTION_SWEEP_MS,
  };

  let dispatchFallbackTimer: ReturnType<typeof setInterval> | null = null;
  let trackerPollTimer: ReturnType<typeof setInterval> | null = null;
  let timeoutSweepTimer: ReturnType<typeof setInterval> | null = null;
  let retentionSweepTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribeConfig: (() => void) | null = null;

  async function pollAllTrackers(): Promise<void> {
    const nowMs = ctx.now();
    // 先拷贝一份快照再迭代：轮询过程中可能有新的运行被启动、也可能有运行通过 onExit 结束，
    // 都会改动 ctx.trackers，不能在遍历一个还在被修改的 Map。
    for (const [runId, tracker] of [...ctx.trackers]) {
      try {
        const done = await tracker.poll(nowMs);
        if (done) {
          ctx.trackers.delete(runId);
        }
      } catch (error) {
        deps.logger.error(`轮询运行 ${runId} 出错`, error);
      }
    }
  }

  const engine: Engine = {
    health(): HealthInfo {
      return getHealth(ctx);
    },
    snapshot(): Snapshot {
      return snapshots.get();
    },
    listWorkers(query: ListWorkersQuery): WorkerSummary[] {
      return listWorkers(ctx, query);
    },
    getWorker(id: string): WorkerDetail | null {
      return getWorkerDetail(ctx, id);
    },
    timeline(id: string, after: number, limit: number): Promise<TimelinePage | null> {
      return timelines.timeline(id, after, limit);
    },
    submit(request: SubmitRequest): Promise<WorkerSummary> {
      return submitWorker(ctx, request);
    },
    send(id: string, request: SendRequest): Promise<WorkerSummary> {
      return sendToWorker(ctx, id, request);
    },
    cancel(id: string): Promise<WorkerSummary> {
      return cancelWorker(ctx, id);
    },
    wait(
      ids: readonly string[],
      mode: WaitMode,
      timeoutMs: number,
      signal: AbortSignal,
    ): Promise<WaitResult> {
      return waiter.wait(ids, mode, timeoutMs, signal);
    },
    pools(): PoolView[] {
      return listPools(ctx);
    },
    patchPool(id: string, patch: PoolPatch): Promise<PoolView> {
      return patchPool(ctx, id, patch);
    },
    setPoolEnabled(id: string, enabled: boolean): Promise<PoolView> {
      return setPoolEnabled(ctx, id, enabled);
    },
    reorderPools(poolIds: readonly string[]): Promise<PoolView[]> {
      return reorderPools(ctx, poolIds);
    },
    stats(query: StatsQuery): StatsResponse {
      return queryStats(ctx, query);
    },
    tasks(query: TasksQuery): TaskPage {
      return queryTasks(ctx, query);
    },
    projects(): ProjectInfo[] {
      return listProjects(ctx);
    },
    roles(): RoleView[] {
      return listRoles(ctx);
    },
    subscribe(listener: (event: ServiceEvent) => void): () => void {
      return events.subscribe(listener);
    },
    requestShutdown(): void {
      deps.onShutdownRequested();
    },

    async start(): Promise<void> {
      // 评审 F6b：接管、过期清理各自内部已经按运行/目录单独 try/catch 隔离了，
      // 这里再包一层是防住两者自己都没料到的顶层异常（例如查库本身出错）——
      // 不管哪个出了意外，都只记日志，不能让服务因为接管或清理失败就启动不起来。
      try {
        await runRecovery(ctx);
      } catch (error) {
        deps.logger.error("服务启动时接管出错", error);
      }
      try {
        await runRetentionSweep(ctx);
      } catch (error) {
        deps.logger.error("服务启动时的原始输出清理出错", error);
      }

      unsubscribeConfig = deps.config.onChange(() => {
        deps.host.invalidate();
        ctx.notifySnapshot();
        ctx.requestDispatch();
      });

      dispatchFallbackTimer = setInterval(() => {
        ctx.requestDispatch();
      }, intervals.dispatchFallbackMs);
      trackerPollTimer = setInterval(() => {
        void pollAllTrackers();
      }, intervals.trackerPollMs);
      timeoutSweepTimer = setInterval(() => {
        void runTimeoutSweep(ctx).catch((error) => deps.logger.error("超时检查出错", error));
      }, intervals.timeoutSweepMs);
      retentionSweepTimer = setInterval(() => {
        void runRetentionSweep(ctx).catch((error) => deps.logger.error("原始输出清理出错", error));
      }, intervals.retentionSweepMs);

      ctx.requestDispatch();
    },

    async stop(): Promise<void> {
      if (dispatchFallbackTimer !== null) {
        clearInterval(dispatchFallbackTimer);
        dispatchFallbackTimer = null;
      }
      if (trackerPollTimer !== null) {
        clearInterval(trackerPollTimer);
        trackerPollTimer = null;
      }
      if (timeoutSweepTimer !== null) {
        clearInterval(timeoutSweepTimer);
        timeoutSweepTimer = null;
      }
      if (retentionSweepTimer !== null) {
        clearInterval(retentionSweepTimer);
        retentionSweepTimer = null;
      }
      if (unsubscribeConfig !== null) {
        unsubscribeConfig();
        unsubscribeConfig = null;
      }
      // 放弃跟踪，不结束任何进程：苦工继续在后台跑，等下次启动时被 recovery 接管。
      ctx.trackers.clear();
    },
  };

  return engine;
}
