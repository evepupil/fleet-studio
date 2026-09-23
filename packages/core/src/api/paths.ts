/** 服务接口路径。命令行、看板、服务三方共用，避免各写各的字符串。 */
export const API_PATHS = {
  health: "/api/health",
  snapshot: "/api/snapshot",
  /** SSE：全局快照 */
  stream: "/api/stream",
  workers: "/api/workers",
  wait: "/api/wait",
  pools: "/api/pools",
  roles: "/api/roles",
  worker: (id: string) => `/api/workers/${encodeURIComponent(id)}`,
  workerTimeline: (id: string) => `/api/workers/${encodeURIComponent(id)}/timeline`,
  /** SSE：单个苦工的时间线增量与详情变化 */
  workerStream: (id: string) => `/api/workers/${encodeURIComponent(id)}/stream`,
  workerMessages: (id: string) => `/api/workers/${encodeURIComponent(id)}/messages`,
  workerCancel: (id: string) => `/api/workers/${encodeURIComponent(id)}/cancel`,
  pool: (id: string) => `/api/pools/${encodeURIComponent(id)}`,
} as const;

/** 会改变状态的请求必须带这个请求头，值是 daemon.json 里的令牌 */
export const TOKEN_HEADER = "x-fleet-token";

/** SSE 事件名 */
export const SSE_EVENTS = {
  /** 全局流：数据是 Snapshot */
  snapshot: "snapshot",
  /** 单苦工流：数据是 TimelineStreamPayload */
  timeline: "timeline",
  /** 单苦工流：数据是 WorkerDetail */
  worker: "worker",
} as const;

/** 服务默认端口 */
export const DEFAULT_PORT = 4870;
