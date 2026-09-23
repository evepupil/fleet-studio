import { describe, expect, it } from "vitest";
import type { ProcessExit } from "../../src/lifecycle/index.js";
import { resolveRunOutcome } from "../../src/lifecycle/index.js";
import { createProgress } from "./factories.js";

const THIRTY_MIN_MS = 30 * 60_000;

const EXIT_ZERO: ProcessExit = { kind: "exited", code: 0, signal: null };

describe("resolveRunOutcome", () => {
  it("规则 1：事件流已经给出「已完成」→ 已完成，原因和说明都是 null", () => {
    const result = resolveRunOutcome({
      progress: createProgress({ outcome: { status: "completed" } }),
      exit: EXIT_ZERO,
      killedBy: null,
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(result).toEqual({ status: "completed", failReason: null, message: null });
  });

  it("规则 2：killedBy 是 cancel → 已取消，说明「已被取消」", () => {
    const result = resolveRunOutcome({
      progress: createProgress(),
      exit: { kind: "exited", code: null, signal: "SIGTERM" },
      killedBy: "cancel",
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(result).toEqual({ status: "cancelled", failReason: null, message: "已被取消" });
  });

  it("规则 3：killedBy 是 timeout → 失败 timeout，说明带整分钟数", () => {
    const result = resolveRunOutcome({
      progress: createProgress(),
      exit: { kind: "exited", code: null, signal: "SIGKILL" },
      killedBy: "timeout",
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(result).toEqual({
      status: "failed",
      failReason: "timeout",
      message: "运行超过 30 分钟被结束",
    });
  });

  it("规则 3：不到 1 分钟的超时也要显示成 1 分钟，不能显示 0", () => {
    const result = resolveRunOutcome({
      progress: createProgress(),
      exit: { kind: "exited", code: null, signal: "SIGKILL" },
      killedBy: "timeout",
      timeoutMs: 10_000,
    });
    expect(result.message).toBe("运行超过 1 分钟被结束");
  });

  it("规则 4：事件流给出失败结局 → 原因和说明取自事件流", () => {
    const result = resolveRunOutcome({
      progress: createProgress({
        outcome: { status: "failed", reason: "model_error", message: "通道重试 3 次后放弃" },
      }),
      exit: EXIT_ZERO,
      killedBy: null,
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(result).toEqual({
      status: "failed",
      failReason: "model_error",
      message: "通道重试 3 次后放弃",
    });
  });

  it("规则 5：进程已经不在了（服务重启接管不了）→ 失败 interrupted", () => {
    const result = resolveRunOutcome({
      progress: createProgress(),
      exit: { kind: "lost" },
      killedBy: null,
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(result).toEqual({
      status: "failed",
      failReason: "interrupted",
      message: "服务重启后找不到苦工进程，输出里也没有正常收尾",
    });
  });

  it("规则 6：退出码非 0，没有 plainOutputTail → 只报退出码", () => {
    const result = resolveRunOutcome({
      progress: createProgress(),
      exit: { kind: "exited", code: 1, signal: null },
      killedBy: null,
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(result).toEqual({ status: "failed", failReason: "exit_code", message: "进程退出码 1" });
  });

  it("规则 6：退出码非 0，且有 plainOutputTail → 追加在说明后面", () => {
    const result = resolveRunOutcome({
      progress: createProgress({ plainOutputTail: "Error: ENOENT" }),
      exit: { kind: "exited", code: 127, signal: null },
      killedBy: null,
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(result).toEqual({
      status: "failed",
      failReason: "exit_code",
      message: "进程退出码 127：Error: ENOENT",
    });
  });

  it("规则 7：退出码为 null 但有 signal → 说明进程被信号结束", () => {
    const result = resolveRunOutcome({
      progress: createProgress(),
      exit: { kind: "exited", code: null, signal: "SIGKILL" },
      killedBy: null,
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(result).toEqual({
      status: "failed",
      failReason: "exit_code",
      message: "进程被信号 SIGKILL 结束",
    });
  });

  it("规则 8a：退出码 0，事件流没给结局，但有 plainOutputTail → 失败 runtime_error", () => {
    const result = resolveRunOutcome({
      progress: createProgress({ plainOutputTail: "Error: missing API key" }),
      exit: EXIT_ZERO,
      killedBy: null,
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(result).toEqual({
      status: "failed",
      failReason: "runtime_error",
      message: "Error: missing API key",
    });
  });

  it("规则 8b：退出码 0，没有 plainOutputTail，但有 finalText → 已完成", () => {
    const result = resolveRunOutcome({
      progress: createProgress({ finalText: "SUMMARY: 完成" }),
      exit: EXIT_ZERO,
      killedBy: null,
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(result).toEqual({ status: "completed", failReason: null, message: null });
  });

  it("规则 8c：退出码 0，既没有 plainOutputTail 也没有 finalText → 失败 runtime_error，没有任何模型输出", () => {
    const result = resolveRunOutcome({
      progress: createProgress(),
      exit: EXIT_ZERO,
      killedBy: null,
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(result).toEqual({
      status: "failed",
      failReason: "runtime_error",
      message: "进程正常退出，但没有任何模型输出",
    });
  });

  it("完成后又被取消：事件流已完成的优先级高于 killedBy=cancel，如实算完成", () => {
    const result = resolveRunOutcome({
      progress: createProgress({ outcome: { status: "completed" } }),
      exit: EXIT_ZERO,
      killedBy: "cancel",
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(result).toEqual({ status: "completed", failReason: null, message: null });
  });

  it("超时但事件流已完成：活干完了，随后被判超时也如实算完成", () => {
    const result = resolveRunOutcome({
      progress: createProgress({ outcome: { status: "completed" } }),
      exit: { kind: "exited", code: null, signal: "SIGKILL" },
      killedBy: "timeout",
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(result).toEqual({ status: "completed", failReason: null, message: null });
  });

  it("退出信息里 code 和 signal 都缺失（规格 6/7/8 字面都没覆盖）：按「事件流没给结局」兜底", () => {
    const result = resolveRunOutcome({
      progress: createProgress(),
      exit: { kind: "exited", code: null, signal: null },
      killedBy: null,
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(result).toEqual({
      status: "failed",
      failReason: "runtime_error",
      message: "进程正常退出，但没有任何模型输出",
    });
  });
});
