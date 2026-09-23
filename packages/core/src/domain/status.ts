/**
 * 运行（苦工的一次进程执行）的五种状态。
 * 苦工的状态等于它最新一次运行的状态。
 */
export const RUN_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const TERMINAL_STATUSES = ["completed", "failed", "cancelled"] as const;
export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

/** 终态不能再变；续接会新建一次运行。 */
export function isTerminalStatus(status: RunStatus): status is TerminalStatus {
  return status === "completed" || status === "failed" || status === "cancelled";
}

/** 失败原因。给人看的说明见 labels.ts。 */
export const FAIL_REASONS = [
  /** 进程没能启动：找不到可执行文件、工作目录不存在等 */
  "spawn_error",
  /** 运行时自己报错收场：缺密钥、参数不对；常见表现是退出码 0 却没有模型输出 */
  "runtime_error",
  /** 模型或通道出错，自动重试也用完了 */
  "model_error",
  /** 进程非零退出，事件流里没有给出原因 */
  "exit_code",
  /** 运行超时，被服务结束 */
  "timeout",
  /** 排队超时 */
  "queue_timeout",
  /** 服务重启后接管不了 */
  "interrupted",
  /** 排队期间所在的池被从配置里删掉了 */
  "pool_removed",
] as const;
export type FailReason = (typeof FAIL_REASONS)[number];

export const RUNTIME_IDS = ["pi", "opencode"] as const;
export type RuntimeId = (typeof RUNTIME_IDS)[number];

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** 谁结束了这次运行。null 表示进程自己结束。 */
export type KilledBy = "cancel" | "timeout" | null;
