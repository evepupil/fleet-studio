import type { RangeKind, StatsDimension } from "../api/requests.js";

/**
 * 统计口径的输入类型。服务层从库里查出「事实」（一次运行、一个任务的最少字段），
 * 核心层的 computeStats 负责按时间范围、分段、维度汇总，全部是纯函数。
 */

/** 一次开跑过的运行（startedAt 不为 null 的才算） */
export interface RunFact {
  runId: string;
  workerId: string;
  /** ISO UTC */
  startedAt: string;
  /** ISO UTC；还在跑时为 null */
  endedAt: string | null;
  /** 结束时写入的真正在跑毫秒数；还在跑时为 null，按 now − startedAt 计 */
  runMs: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  /** 美元；没报费用为 null */
  costUsd: number | null;
}

/** 一个任务（苦工会话）的分组字段 */
export interface WorkerFact {
  workerId: string;
  /** ISO UTC */
  createdAt: string;
  projectKey: string;
  role: string;
  /** 没被放行过的任务为 null，它们不会有 RunFact */
  channel: string | null;
  modelName: string | null;
}

/**
 * 本地时区。核心层不读系统时区，由调用方传入：
 * 本地时间 = UTC 时间 + offsetMinutes(该 UTC 时刻)。测试里传固定偏移（例如 +480）。
 */
export interface TimeZone {
  offsetMinutes(utcMs: number): number;
}

/** 请求里的时间范围（和 statsQuerySchema、tasksQuerySchema 的 range / from / to 同义） */
export interface RangeRequest {
  kind: RangeKind;
  /** custom 时必有：本地日期 YYYY-MM-DD（含） */
  from?: string | undefined;
  /** custom 时必有：本地日期 YYYY-MM-DD（含） */
  to?: string | undefined;
}

/** 解析后的时间范围，毫秒时间戳 */
export interface ResolvedRange {
  /** 起点（含）；all 时为 null，表示不设下限 */
  fromMs: number | null;
  /** 终点（不含） */
  toMs: number;
}

/** 分组维度对应的显示名和配色 */
export interface StatsLabels {
  /** 项目 key → 项目名；找不到时显示 key 本身 */
  projectName: ReadonlyMap<string, string>;
  /** 项目 key → 项目色位置 */
  projectColor: ReadonlyMap<string, number>;
  /** 角色编号 → 中文名；找不到时显示编号本身 */
  roleLabel: ReadonlyMap<string, string>;
  /**
   * 模型、渠道、角色的配色位置（0～7）。由服务层查配色表，第一次出现时分配并记住。
   * 项目不走这里，用 projectColor。
   */
  seriesColor(dimension: Exclude<StatsDimension, "project">, key: string): number;
}

export interface ComputeStatsInput {
  range: RangeRequest;
  dimension: StatsDimension;
  nowMs: number;
  tz: TimeZone;
  /**
   * 至少覆盖「所选范围」和「今天」两段的运行事实（可以多给，函数自己按时间过滤）。
   * all 时必须是全部运行。
   */
  runs: readonly RunFact[];
  /** runs 涉及的全部任务，加上所选范围和今天内创建的全部任务 */
  workers: readonly WorkerFact[];
  labels: StatsLabels;
}

/** 分布和趋势最多画几项，其余合并成「其他」 */
export const STATS_TOP_N = 8;
