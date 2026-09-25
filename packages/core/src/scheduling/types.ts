import type { RuntimeId } from "../domain/status.js";

/**
 * 容量调度用到的输入输出类型。
 * 这里只描述“调度需要知道什么”，不描述运行记录本身的全部字段（那是 domain 的事）。
 */

/**
 * 一个模型池的放行规则。传给调度函数的 limits 数组顺序就是派活优先级（配置里池的先后）。
 */
export interface PoolLimit {
  poolId: string;
  /** 同时在跑的上限；0 表示暂停放行 */
  capacity: number;
  /** 单个项目在这个池里最多同时占几个；null 表示不限 */
  perProjectCap: number | null;
  /** 停用的池不放行任何运行（在跑的不受影响） */
  enabled: boolean;
  /** 这个池配了哪些运行时的模型；没点名的排队只会被分给支持它运行时的池 */
  runtimes: readonly RuntimeId[];
}

/** 池里一个正在跑的运行。 */
export interface RunningEntry {
  runId: string;
  poolId: string;
  projectKey: string;
}

/** 一个排队中的运行。 */
export interface QueuedEntry {
  runId: string;
  /**
   * 点名的池：主会话点名的、或续接沿用的原池。
   * null 表示没点名，在公共排队里，由任何一个支持它运行时的启用池接走。
   */
  requestedPoolId: string | null;
  runtime: RuntimeId;
  projectKey: string;
  /** ISO 8601 UTC，入队时间 */
  queuedAt: string;
}

/** 公平放行顺序：不考虑还剩几个空位，只回答“先后顺序应该是什么”。 */
export interface DispatchOrder {
  /** 按公平规则依次可以放行的运行编号（不考虑还剩几个空位） */
  eligible: string[];
  /** 因单项目上限被挡住的运行编号，按排队时间先后 */
  blocked: string[];
}

/** 一次放行决定：把哪个运行放进哪个池。没点名的运行靠它得知自己被分到了哪个池。 */
export interface DispatchDecision {
  runId: string;
  poolId: string;
}
