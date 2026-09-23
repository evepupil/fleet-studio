import type { FailReason, RunStatus } from "./status.js";

/** 状态的中文名，命令行和看板共用。 */
export const STATUS_LABELS: Readonly<Record<RunStatus, string>> = {
  queued: "排队中",
  running: "工作中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

/** 失败原因的中文说明，命令行和看板共用。 */
export const FAIL_REASON_LABELS: Readonly<Record<FailReason, string>> = {
  spawn_error: "启动失败",
  runtime_error: "运行时报错",
  model_error: "模型或通道出错",
  exit_code: "异常退出",
  timeout: "运行超时",
  queue_timeout: "排队超时",
  interrupted: "服务重启后接管不了",
  pool_removed: "所在的池已被删除",
};
