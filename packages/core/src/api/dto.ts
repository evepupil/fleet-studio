import type { ErrorCode } from "../domain/errors.js";
import type { RetryInfo } from "../domain/records.js";
import type { ParsedReport, Verdict } from "../domain/report.js";
import type { FailReason, RunStatus, RuntimeId, ThinkingLevel } from "../domain/status.js";
import type { TimelineEvent } from "../domain/timeline.js";
import type { Usage } from "../domain/usage.js";

/**
 * 服务对外接口的响应形状。命令行和看板都只认这里的类型。
 * 所有时间都是 ISO 8601 UTC 字符串。
 */

export interface RoleView {
  id: string;
  label: string;
  description: string;
}

/** 容量条上被占用的一格。 */
export interface SlotView {
  runId: string;
  workerId: string;
  projectKey: string;
  title: string;
  role: string;
  roleLabel: string;
  startedAt: string;
  /** 正在自动重试 */
  retrying: boolean;
}

export interface QueueShare {
  projectKey: string;
  count: number;
}

/** 池最近一段时间的健康情况。 */
export interface PoolHealth {
  windowMinutes: number;
  /** 窗口内结束且已完成的运行数 */
  completed: number;
  /** 窗口内结束且失败的运行数（不含取消） */
  failed: number;
  /** 此刻正在自动重试的运行数 */
  retrying: number;
}

export interface PoolView {
  id: string;
  label: string;
  /** 显示用的模型名 */
  model: string;
  capacity: number;
  perProjectCap: number | null;
  running: number;
  queued: number;
  /**
   * 被占用的格子。按项目成段排列：在跑多的项目在前，并列时最早开跑的在前；
   * 同一项目内按开跑时间先后。
   */
  slots: SlotView[];
  /** 排队数按项目拆分，顺序同 slots 的项目顺序，没在跑的项目排在后面 */
  queuedByProject: QueueShare[];
  health: PoolHealth;
  /** 今天（本地时区）开跑的运行的用量之和 */
  usageToday: Usage;
}

export interface ProjectView {
  key: string;
  path: string;
  name: string;
  colorIndex: number;
  /** 快照里这个项目的苦工按最新状态计数 */
  counts: Record<RunStatus, number>;
  /** 今天（本地时区）开跑的运行的用量之和 */
  usageToday: Usage;
  lastActivityAt: string | null;
}

export interface WorkerSummary {
  id: string;
  projectKey: string;
  cwd: string;
  title: string;
  role: string;
  roleLabel: string;
  runtime: RuntimeId;
  poolId: string;
  model: string;
  /** 最新一次运行的状态 */
  status: RunStatus;
  failReason: FailReason | null;
  errorMessage: string | null;
  /** 最新一次运行的序号 */
  runSeq: number;
  createdAt: string;
  /** 最新一次运行的排队时间 */
  queuedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  lastActivityAt: string | null;
  /** 最近一条工具调用的摘要 */
  activity: string | null;
  retry: RetryInfo | null;
  /** 最新一次运行回报里的结论 */
  verdict: Verdict | null;
  /** 所有运行的用量之和 */
  usage: Usage;
  /** 排队中时在所属池里预计第几个被放行（从 1 开始）；其他状态为 null */
  queuePosition: number | null;
}

export interface RunView {
  id: string;
  seq: number;
  status: RunStatus;
  failReason: FailReason | null;
  errorMessage: string | null;
  prompt: string;
  queuedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  exitCode: number | null;
  usage: Usage;
  finalText: string | null;
  report: ParsedReport | null;
}

export interface WorkerDetail {
  summary: WorkerSummary;
  projectPath: string;
  sessionRef: string | null;
  thinking: ThinkingLevel | null;
  /** 按序号从小到大 */
  runs: RunView[];
}

/** 看板一屏所需的全部数据。 */
export interface Snapshot {
  version: string;
  serverTime: string;
  pools: PoolView[];
  /** 只包含快照里有苦工的项目。有在跑苦工的在前，其余按最近活动倒序 */
  projects: ProjectView[];
  /** 进行中的全部苦工 + 最近 snapshotWindowHours 小时内结束的苦工，按创建时间倒序，最多 300 个 */
  workers: WorkerSummary[];
  roles: RoleView[];
  /** 配置文件当前有错时的说明（服务仍在用上一份有效配置）；没错时为 null */
  configError: string | null;
}

export interface TimelinePage {
  events: TimelineEvent[];
  /** 下一页请求时作为 after 传回的值 */
  next: number;
  /** 这个苦工目前一共有多少条事件 */
  total: number;
}

export interface WaitResult {
  /** 已结束的苦工（按请求里的编号顺序） */
  done: WorkerSummary[];
  /** 还没结束的苦工编号 */
  pending: string[];
  timedOut: boolean;
}

export interface SubmitResponse {
  worker: WorkerSummary;
}

export interface HealthInfo {
  ok: true;
  version: string;
  startedAt: string;
  pid: number;
  home: string;
  port: number;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
  };
}

/** 单个苦工的 SSE：时间线增量 */
export interface TimelineStreamPayload {
  events: TimelineEvent[];
}
