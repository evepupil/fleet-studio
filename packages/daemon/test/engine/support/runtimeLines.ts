/**
 * 拼 pi / opencode 事件流一行 JSON 的小工具，形状照抄两份运行时调研报告和 core 包的真实样本
 * （packages/core/test/fixtures、packages/core/test/runtimes/pi/factories.ts），
 * 引擎测试用假进程托管把这些行写进 out.jsonl，走真实的 OutputTailer + 运行时适配器解析。
 */

const DEFAULT_AT_MS = 1_700_000_000_000;

export function piSessionLine(sessionId: string): string {
  return JSON.stringify({ type: "session", id: sessionId });
}

export function piAgentStartLine(): string {
  return JSON.stringify({ type: "agent_start" });
}

export function piAssistantTextLine(text: string, stopReason = "stop"): string {
  return JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
      stopReason,
      timestamp: DEFAULT_AT_MS,
    },
  });
}

export function piErrorLine(errorMessage: string): string {
  return JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [],
      stopReason: "error",
      errorMessage,
      timestamp: DEFAULT_AT_MS,
    },
  });
}

export function piAutoRetryStartLine(attempt: number, errorMessage: string): string {
  return JSON.stringify({
    type: "auto_retry_start",
    attempt,
    maxAttempts: 3,
    delayMs: 2000,
    errorMessage,
  });
}

export function piAgentSettledLine(): string {
  return JSON.stringify({ type: "agent_settled" });
}

export function piToolCallLine(
  callId: string,
  tool: string,
  args: Record<string, unknown>,
): string {
  return JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "toolCall", id: callId, name: tool, arguments: args }],
      stopReason: "toolUse",
      timestamp: DEFAULT_AT_MS,
    },
  });
}

export function piToolResultLine(callId: string, ok: boolean, text: string): string {
  return JSON.stringify({
    type: "message_end",
    message: {
      role: "toolResult",
      toolCallId: callId,
      toolName: "bash",
      isError: !ok,
      content: [{ type: "text", text }],
    },
  });
}

export function opencodeStepStartLine(sessionId: string, timestamp = DEFAULT_AT_MS): string {
  return JSON.stringify({
    type: "step_start",
    timestamp,
    sessionID: sessionId,
    part: { type: "step-start" },
  });
}

export function opencodeTextLine(
  sessionId: string,
  text: string,
  timestamp = DEFAULT_AT_MS + 100,
): string {
  return JSON.stringify({
    type: "text",
    timestamp,
    sessionID: sessionId,
    part: { type: "text", text },
  });
}

export function opencodeStepFinishLine(
  sessionId: string,
  reason = "stop",
  timestamp = DEFAULT_AT_MS + 500,
): string {
  return JSON.stringify({
    type: "step_finish",
    timestamp,
    sessionID: sessionId,
    part: {
      type: "step-finish",
      reason,
      tokens: { total: 10, input: 5, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
      cost: 0,
    },
  });
}

export function opencodeErrorLine(
  sessionId: string,
  message: string,
  timestamp = DEFAULT_AT_MS + 500,
): string {
  return JSON.stringify({
    type: "error",
    timestamp,
    sessionID: sessionId,
    error: { message },
  });
}
