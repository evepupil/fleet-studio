import type { FailReason, KilledBy, TerminalStatus } from "../domain/status.js";
import type { RunProgress } from "../runtimes/types.js";

/**
 * 进程真正退出时观察到的信息。
 * lost：服务重启后发现进程已经不在了，没能拿到退出码（例如机器重启、进程被外部杀掉）。
 */
export type ProcessExit =
  | { kind: "exited"; code: number | null; signal: string | null }
  | { kind: "lost" };

export interface OutcomeInput {
  /** 事件流解析出的进展，可能已经自带结局 */
  progress: RunProgress;
  exit: ProcessExit;
  /** 谁结束了这次运行；null 表示进程自己结束，不是被取消或超时打断的 */
  killedBy: KilledBy;
  /** 这次运行配置的超时时长，用来拼超时说明文字 */
  timeoutMs: number;
}

export interface ResolvedOutcome {
  status: TerminalStatus;
  failReason: FailReason | null;
  message: string | null;
}

/** timeoutMs 换算成“整分钟”给人看；不到 1 分钟也要显示成 1，不能显示 0 分钟。 */
function timeoutMinutesLabel(timeoutMs: number): number {
  return Math.max(1, Math.floor(timeoutMs / 60_000));
}

/**
 * 判定一次运行最终算什么结局。按模块设计 3.7 的 8 条规则顺序判断，命中即返回。
 *
 * 顺序本身就是优先级：事件流已经说完成，就不再看是谁杀的进程或超时与否——
 * 活干完了，随后不管被取消还是超时都如实算完成（对应“超时但事件流已完成”这种场景）。
 */
export function resolveRunOutcome(input: OutcomeInput): ResolvedOutcome {
  const { progress, exit, killedBy, timeoutMs } = input;
  // 取成局部变量，让下面的判别式联合类型收窄稳定作用到整个 if 块里。
  const outcome = progress.outcome;

  // 1. 事件流已经给出「已完成」。
  if (outcome?.status === "completed") {
    return { status: "completed", failReason: null, message: null };
  }

  // 2. 主会话主动取消。
  if (killedBy === "cancel") {
    return { status: "cancelled", failReason: null, message: "已被取消" };
  }

  // 3. 服务判定超时并结束了进程。
  if (killedBy === "timeout") {
    return {
      status: "failed",
      failReason: "timeout",
      message: `运行超过 ${timeoutMinutesLabel(timeoutMs)} 分钟被结束`,
    };
  }

  // 4. 事件流自己给出了失败结局（模型/通道出错，或运行时报错）。
  if (outcome?.status === "failed") {
    return {
      status: "failed",
      failReason: outcome.reason,
      message: outcome.message,
    };
  }

  // 5. 服务重启后接管不了：进程已经不在了，事件流也没能留下结局。
  if (exit.kind === "lost") {
    return {
      status: "failed",
      failReason: "interrupted",
      message: "服务重启后找不到苦工进程，输出里也没有正常收尾",
    };
  }

  // 6. 非零退出码，事件流没解释——只能照实报退出码；有原始输出尾巴就一起带上。
  if (exit.code !== null && exit.code !== 0) {
    const tail = progress.plainOutputTail !== null ? `：${progress.plainOutputTail}` : "";
    return {
      status: "failed",
      failReason: "exit_code",
      message: `进程退出码 ${exit.code}${tail}`,
    };
  }

  // 7. 没有退出码但有信号：进程是被信号结束的（且不是我们发起的取消/超时，那两种已经在前面命中）。
  if (exit.code === null && exit.signal !== null) {
    return {
      status: "failed",
      failReason: "exit_code",
      message: `进程被信号 ${exit.signal} 结束`,
    };
  }

  // 8. 退出码 0（或者干脆没有退出信息）但事件流没给结局，只能靠原始输出兜底判断。
  if (progress.plainOutputTail !== null) {
    // 例如缺密钥时运行时打印一行提示后就以 0 退出，事件流里看不出这是失败。
    return { status: "failed", failReason: "runtime_error", message: progress.plainOutputTail };
  }
  if (progress.finalText !== null) {
    return { status: "completed", failReason: null, message: null };
  }
  return {
    status: "failed",
    failReason: "runtime_error",
    message: "进程正常退出，但没有任何模型输出",
  };
}
