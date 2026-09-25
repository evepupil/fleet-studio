import type { ErrorCode } from "../domain/errors.js";
import type { RetryInfo } from "../domain/records.js";
import type { ParsedReport, Verdict } from "../domain/report.js";
import type { FailReason, RunStatus, RuntimeId, ThinkingLevel } from "../domain/status.js";
import type { TimelineEvent } from "../domain/timeline.js";
import type { Usage } from "../domain/usage.js";
import type { RangeKind, StatsDimension } from "./requests.js";

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

/** 池最近 24 小时的战绩（按运行的结束时间落在窗口内统计） */
export interface PoolRecent {
  windowHours: number;
  completed: number;
  /** 失败数，不含取消 */
  failed: number;
  /** 窗口内结束的运行真正在跑的平均毫秒数（已完成和失败都算）；窗口内没有结束的运行时为 null */
  avgRunMs: number | null;
}

export interface PoolView {
  id: string;
  label: string;
  /** 显示用的模型名，例如 mcgrox/deepseek-v4.1-flash */
  model: string;
  /** 渠道名，例如 mcgrox */
  channel: string;
  /** 不带渠道的模型名，例如 deepseek-v4.1-flash */
  modelName: string;
  /** 派活优先级，从 1 开始，等于它在配置里的先后 */
  priority: number;
  enabled: boolean;
  capacity: number;
  perProjectCap: number | null;
  running: number;
  /** 点名这个池（含续接沿用）正在排队的运行数；公共排队不算在内，见 Snapshot.sharedQueued */
  queued: number;
  /**
   * 被占用的格子。按项目成段排列：在跑多的项目在前，并列时最早开跑的在前；
   * 同一项目内按开跑时间先后。
   */
  slots: SlotView[];
  /** 点名排队数按项目拆分，顺序同 slots 的项目顺序，没在跑的项目排在后面 */
  queuedByProject: QueueShare[];
  health: PoolHealth;
  recent: PoolRecent;
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
  /** 主会话点名的池；没点名为 null */
  requestedPool: string | null;
  /** 实际所在的池；没点名且还没被放行过时为 null（在公共排队里） */
  poolId: string | null;
  /** 显示用的模型名；poolId 为 null 时也为 null */
  model: string | null;
  channel: string | null;
  modelName: string | null;
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
  /** 各次运行真正在跑的毫秒数之和；正在跑的那次算到生成这份数据的时刻 */
  runMs: number;
  /**
   * 排队中时预计第几个被放行（从 1 开始）：点名的按所在池的排队算，没点名的按公共排队算；
   * 其他状态为 null
   */
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

/** 总览实时卡片的数（全部来自当下的状态，不受时间筛选影响） */
export interface LiveTotals {
  /** 所有池的在跑数之和（含停用池里还没跑完的） */
  slotsUsed: number;
  /** 启用池的容量之和 */
  slotsTotal: number;
  /** 工作中的苦工数 */
  running: number;
  /** 排队中的苦工数（点名的 + 公共排队） */
  queued: number;
  /** 工作中且正在自动重试的苦工数 */
  retrying: number;
}

/** 看板一屏所需的全部数据。 */
export interface Snapshot {
  version: string;
  serverTime: string;
  /** 按派活优先级排列（等于配置里的先后） */
  pools: PoolView[];
  /** 没点名、因为能用的池都满了（或都停用了）而在公共排队的运行数 */
  sharedQueued: number;
  live: LiveTotals;
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

/** 项目的基本信息（任务页项目筛选用，包含所有有过任务的项目） */
export interface ProjectInfo {
  key: string;
  path: string;
  name: string;
  colorIndex: number;
}

/** GET /api/tasks 的一页 */
export interface TaskPage {
  items: WorkerSummary[];
  /** 下一页请求时原样传回；没有下一页时为 null */
  nextCursor: string | null;
  /** 符合筛选条件的任务总数 */
  total: number;
}

/** 统计实际使用的时间范围 */
export interface StatsRange {
  kind: RangeKind;
  /** 起点（含），ISO UTC；「全部」时为最早一条数据所在分段的起点，没有数据时为 null */
  from: string | null;
  /** 终点（不含），ISO UTC；today / 7d / 30d / all 为当前时刻，custom 为 to 日期次日零点与当前时刻中较早的那个 */
  to: string;
}

export type StatsGranularity = "hour" | "day" | "week";

/** 一组统计数 */
export interface StatsTotals {
  /** 范围内开跑的运行的用量之和 */
  usage: Usage;
  /** 范围内创建的任务（苦工会话）数 */
  tasks: number;
  /** 范围内开跑的运行真正在跑的毫秒数之和（在跑的算到当前） */
  runMs: number;
  /** runMs ÷ 范围内至少有一次运行开跑的任务数；没有这样的任务时为 null */
  avgRunMs: number | null;
}

/** 分布表里的一行（环形图的一个扇区） */
export interface ShareItem {
  /** 分组键：模型名 / 渠道名 / 项目 key / 角色编号；「其他」为空字符串 */
  key: string;
  /** 显示名：模型名 / 渠道名 / 项目名 / 角色中文名；「其他」为「其他」 */
  label: string;
  /** 配色位置 0～7；「其他」为 null（用 --series-other） */
  colorIndex: number | null;
  isOther: boolean;
  tasks: number;
  tokens: number;
  runMs: number;
}

/** 趋势图的一条线 */
export interface TrendSeries {
  key: string;
  label: string;
  colorIndex: number | null;
  isOther: boolean;
  /** 和 StatsResponse.buckets 一一对应的 token 合计 */
  points: number[];
}

/** GET /api/stats 的响应：总览页除实时卡片外的全部数据 */
export interface StatsResponse {
  range: StatsRange;
  dimension: StatsDimension;
  granularity: StatsGranularity;
  /** 每个分段的起点，ISO UTC，按本地时间对齐（整点 / 零点 / 周一零点） */
  buckets: string[];
  total: StatsTotals;
  /** 今天（本地零点到现在）的同一组数，不受所选范围影响 */
  today: StatsTotals;
  /** 按 dimension 分组的 token 分布：按 tokens 从多到少，前 8 名 + 「其他」（有剩余时） */
  tokenShare: ShareItem[];
  /** 按项目的任务次数分布：tasks 为范围内创建的任务数，按 tasks 从多到少，前 8 名 + 「其他」 */
  tasksByProject: ShareItem[];
  /** 按 dimension 分组的 token 趋势：线的集合与 tokenShare 相同（同样的前 8 名 + 「其他」） */
  tokenTrend: TrendSeries[];
}
