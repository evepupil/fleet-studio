import type { PoolConfig, RoleConfig } from "../config/schema.js";
import type { RetryInfo } from "../domain/records.js";
import type { FailReason, RuntimeId, ThinkingLevel } from "../domain/status.js";
import type { TimelineDraft } from "../domain/timeline.js";
import type { Usage } from "../domain/usage.js";

/**
 * 任务正文超过这个字符数就改为写文件传给运行时。
 * Windows 整条命令行上限约 32767 个字符，给其余参数留出余量。
 */
export const ARGV_PROMPT_MAX_CHARS = 24_000;

/** 事件流自己给出的结局。进程层面的结局（超时、取消、崩溃）由 resolveRunOutcome 合并判断。 */
export type RunOutcome =
  | { status: "completed" }
  | {
      status: "failed";
      reason: Extract<FailReason, "model_error" | "runtime_error">;
      message: string;
    };

/** 解析器从事件流里读出来的运行进展。 */
export interface RunProgress {
  /** 事件流里出现的会话编号（opencode 续接要用）；没出现时为 null */
  sessionRef: string | null;
  /**
   * starting：还没有任何模型事件；working：在干活；retrying：在等自动重试；
   * ended：事件流已经收尾（pi 发出了 agent_settled，或解析器判定通道连续失败而放弃）。
   * 进程在 ended 之后迟迟不退出，调度引擎会主动结束它。
   */
  phase: "starting" | "working" | "retrying" | "ended";
  /**
   * 事件流给出的结局；还没给出时为 null。
   * 可以早于 ended 出现（例如 opencode 在最后一步正常结束时先记为已完成，之后若出现致命错误再改为失败）。
   */
  outcome: RunOutcome | null;
  retry: RetryInfo | null;
  /** 这次运行累计的用量 */
  usage: Usage;
  /** 最近一条工具调用的摘要，例如「bash · pnpm test」 */
  activity: string | null;
  /** 最近一条事件的时间 */
  lastEventAt: string | null;
  /** 最近一条模型文字；运行结束时就是回报原文 */
  finalText: string | null;
  /** 最后几行非事件格式的输出（例如缺密钥的提示），用于失败说明；没有时为 null */
  plainOutputTail: string | null;
  /** 事件流里报告的模型名；没有时为 null */
  model: string | null;
  /** 已产出的时间线事件数 */
  eventCount: number;
}

export type OutputStream = "stdout" | "stderr";

/**
 * 事件流解析器：一次运行一个实例，按行喂入原始输出。
 * 必须对任何输入都不抛异常：看不懂的行转成 output 事件。
 */
export interface StreamReducer {
  /** 喂一行原始输出（不含换行符），返回这一行产生的时间线事件，可能为空数组 */
  push(line: string, stream: OutputStream, at: string): TimelineDraft[];
  /** 当前进展（每次返回新对象，调用方可以随意保存） */
  progress(): RunProgress;
}

export interface BuildLaunchInput {
  /** 这次运行的任务正文或追加指令 */
  prompt: string;
  /** 这次运行专属的临时目录（绝对路径）；适配器需要把内容写成文件时，文件放在这里 */
  runDir: string;
  /** 苦工干活的目录（绝对路径） */
  cwd: string;
  title: string;
  /** pi 总是有（fleet-<苦工编号>）；opencode 只有续接时才有 */
  sessionRef: string | null;
  isContinuation: boolean;
  thinking: ThinkingLevel | null;
  pool: PoolConfig;
  /** 提示词路径已展开成绝对路径的角色配置 */
  role: RoleConfig;
  /** 运行时没法用文件追加角色提示词时，调用方已读入的角色提示词全文；其余情况为 null */
  rolePromptText: string | null;
}

/** 启动前需要调用方写好的文件。 */
export interface LaunchFile {
  /** 绝对路径，位于 BuildLaunchInput.runDir 之下 */
  path: string;
  content: string;
}

export interface LaunchSpec {
  /** 传给运行时可执行文件的参数，不含可执行文件本身；每个元素原样作为一个参数，不经过任何 shell */
  args: string[];
  /** 启动前要先写好的文件（例如过长的任务正文）；没有时为空数组 */
  files: LaunchFile[];
}

/** 一种苦工运行时（pi、opencode）的全部差异都收在适配器里。 */
export interface RuntimeAdapter {
  readonly id: RuntimeId;
  /** 池在这个运行时下的显示用模型名；池没有为这个运行时指定模型时返回 null */
  displayModel(pool: PoolConfig): string | null;
  /** 生成启动参数。池没有为这个运行时指定模型时抛 FleetError("runtime_unavailable") */
  buildLaunch(input: BuildLaunchInput): LaunchSpec;
  createReducer(): StreamReducer;
}
