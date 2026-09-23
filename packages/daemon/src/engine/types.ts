import type {
  ProcessExit,
  ResolvedOutcome,
  RunProgress,
  RunRecord,
  Snapshot,
  StreamReducer,
  TimelineDraft,
  TimelinePage,
  Usage,
  WaitResult,
  WorkerRecord,
} from "@fleet/core";
import type { ConfigStore, DaemonPaths, Logger } from "../app/types.js";
import type { OutputTailer, ProcessExitInfo, ProcessHost } from "../process/types.js";
import type { Repos } from "../store/types.js";
import type { FleetService, ServiceEvent, WaitMode } from "./service.js";

/**
 * 引擎内部与外部共用的类型契约。所有引擎子模块只从这里取类型，
 * 避免子模块之间互相 import 造成循环依赖（本文件不 import 任何其它 engine/*.ts 文件）。
 */

/** 服务装配那一路组装好这些依赖后调用 createEngine。 */
export interface EngineDeps {
  repos: Repos;
  host: ProcessHost;
  config: ConfigStore;
  paths: DaemonPaths;
  logger: Logger;
  version: string;
  startedAt: string;
  getPort: () => number;
  platform: "win32" | "posix";
  /** 展开 ~ 用 */
  homeDir: string;
  /** 展开 builtin: 用，即 fleet-studio 仓库根目录 */
  builtinRoot: string;
  /** 默认 Date.now，测试可注入 */
  now?: () => number;
  /** HTTP 收到退出请求后调用 */
  onShutdownRequested: () => void;
  /**
   * 测试专用：覆盖四个定时器的间隔（毫秒），不传就是规格里的默认值。
   * 引擎单测验证「过期清理每小时跑一次」这类场景时，用真定时器 + 很短的间隔比
   * 假定时器和真实文件 IO 混用更可靠，所以规格 3.1 之外单独开这个口子（详见任务回报）。
   */
  intervals?: {
    dispatchFallbackMs?: number;
    trackerPollMs?: number;
    timeoutSweepMs?: number;
    retentionSweepMs?: number;
  };
}

/** 引擎在 FleetService 之外多出的生命周期方法。 */
export interface Engine extends FleetService {
  /** 接管 → 过期清理 → 启动定时器 → 放行一次 */
  start(): Promise<void>;
  /** 停掉定时器、放弃跟踪；苦工进程继续运行，等下次启动接管 */
  stop(): Promise<void>;
}

/** 事件总线：接口层订阅这里的事件，引擎内部（如 waiter）也订阅同一条总线。 */
export interface EventBus {
  emit(event: ServiceEvent): void;
  subscribe(listener: (event: ServiceEvent) => void): () => void;
}

/** 一个苦工的完整时间线缓存与增量通知。 */
export interface TimelineStore {
  /** 记下某次运行新产出的草稿（内存中，供尚未终态的运行使用）。 */
  appendDrafts(workerId: string, runId: string, drafts: readonly TimelineDraft[]): void;
  /** 重新拼接某个苦工的完整时间线；比缓存多出的尾部事件通过事件总线发出。 */
  refresh(workerId: string): Promise<void>;
  /** 苦工不存在返回 null；否则返回 seq > after 的最多 limit 条。 */
  timeline(workerId: string, after: number, limit: number): Promise<TimelinePage | null>;
  /** 苦工被过期清理删掉之后调用：清掉缓存和常驻标记，避免长期运行的服务里这些表只增不减（评审 F6a）。 */
  forget(workerId: string): void;
}

/** 快照缓存：查库、算排队位置、拼快照、按 5 秒节流重算。 */
export interface SnapshotService {
  get(): Snapshot;
  markDirty(): void;
  /** 当前排队中的运行在各自池里的预计放行位置，submit/send/cancel 用来拼准确的摘要。 */
  queuePositions(): ReadonlyMap<string, number>;
}

/** 等苦工结束：submit/send/cancel 里「等一小段时间」的需求也复用同一份实现。 */
export interface Waiter {
  wait(
    ids: readonly string[],
    mode: WaitMode,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<WaitResult>;
}

/** 一次运行的跟踪句柄：由 runTracker.ts 创建，engine.ts 的共享定时器和 onExit 回调驱动它。 */
export interface RunTrackerHandle {
  readonly runId: string;
  readonly workerId: string;
  /** 是否是服务重启后接管的运行（没有 onExit 回调，只能靠轮询存活判断退出）。 */
  readonly isAdopted: boolean;
  /** 引擎共享的 400ms 定时器每次调用；返回 true 表示这次调用之后应该从跟踪表里移除。 */
  poll(now: number): Promise<boolean>;
  /** 进程退出时调用（仅非接管的跟踪器会被这样调用一次）。 */
  handleExit(exit: ProcessExitInfo): Promise<void>;
}

/** 引擎运转所需的共享上下文：各子模块的公共函数都以它为第一个参数。 */
export interface EngineContext {
  readonly deps: EngineDeps;
  /** deps.now 的兜底版本，统一取时间入口。 */
  readonly now: () => number;
  readonly events: EventBus;
  readonly timelines: TimelineStore;
  readonly snapshots: SnapshotService;
  readonly waiter: Waiter;
  /** runId → 跟踪句柄，只包含仍在跟踪中的运行。 */
  readonly trackers: Map<string, RunTrackerHandle>;
  /** 请求跑一轮放行；createEngine 组装完 dispatcher 后才会被替换成真正的实现。 */
  requestDispatch: () => void;
  /** 某苦工的状态、用量、活动等发生变化：发 worker 事件，并顺带标记快照变脏、发 snapshot 事件。 */
  notifyWorker(workerId: string): void;
  /** 只有快照相关但不特指某个苦工的变化（例如调整了池容量）：标脏并发 snapshot 事件。 */
  notifySnapshot(): void;
}

/** finishRun 的输入：终态已经判定好，只负责写库和通知。 */
export interface FinishInput {
  run: RunRecord;
  worker: WorkerRecord;
  outcome: ResolvedOutcome;
  exitCode: number | null;
  usage: Usage;
  activity: string | null;
  finalText: string | null;
  eventCount: number;
  /**
   * 收尾前重读到的当前状态必须等于这个值才真的收尾，不等就放弃（评审 F1/F2/F4）。
   * 排队超时、池被删除、取消排队中的运行传 "queued"；进程退出收尾、接管后收尾传 "running"。
   * 不传就只做「已是终态」的兜底检查，不做更严格的期望值比较。
   */
  expectedStatus?: "queued" | "running";
}

/** resolveAndFinishRun 需要的、由事件流解析出的进展与进程退出信息，交给 resolveRunOutcome 判定结局后再收尾。 */
export interface ResolveAndFinishInput {
  run: RunRecord;
  worker: WorkerRecord;
  progress: RunProgress;
  exit: ProcessExit;
}

export type { OutputTailer, ProcessExit, ProcessExitInfo, StreamReducer };
