/**
 * 容量调度用到的输入输出类型。
 * 这里只描述“调度需要知道什么”，不描述运行记录本身的全部字段（那是 domain 的事）。
 */

/** 一个模型池的放行规则：容量与可选的单项目上限。 */
export interface PoolLimit {
  poolId: string;
  /** 同时在跑的上限；0 表示暂停放行 */
  capacity: number;
  /** 单个项目在这个池里最多同时占几个；null 表示不限 */
  perProjectCap: number | null;
}

/** 池里一个正在跑的运行。 */
export interface RunningEntry {
  runId: string;
  poolId: string;
  projectKey: string;
}

/** 池里一个排队中的运行。 */
export interface QueuedEntry {
  runId: string;
  poolId: string;
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
