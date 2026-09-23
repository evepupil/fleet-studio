/**
 * pi 事件里各种「不知道形状」的 JSON 片段，转成时间线要展示的文字。
 * 只管数据整形，不认识 pi 的事件类型本身——认事件类型是 reducer.ts 的事。
 *
 * 这里的取值函数统一返回 undefined 表示「这个字段不存在或者形状不对」，
 * 从不抛异常，配合 reducer.ts「解析器永不抛异常」的要求。
 */

import type { RetryInfo } from "../../domain/records.js";
import type { TimelineDraft } from "../../domain/timeline.js";
import { TEXT_EVENT_MAX, TOOL_DETAIL_MAX, TOOL_RESULT_PREVIEW_MAX } from "../../domain/timeline.js";
import type { Usage } from "../../domain/usage.js";
import { ZERO_USAGE } from "../../domain/usage.js";
import type { Truncated } from "../text.js";
import { oneLine, truncateText } from "../text.js";
import type { RunOutcome } from "../types.js";

/** pi 事件流里除了 type 字段，其余字段的形状全靠猜，先统一收窄成「纯对象」。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function getFiniteNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function getBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

export function getRecord(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

/**
 * 从事件对象上找一个「这一行自带的时间」：`session` 事件自带 ISO 字符串；
 * message_start/message_end/turn_end 包着一条 message，取它的毫秒时间戳换算成 ISO；
 * 剩下的事件（agent_start、turn_start、agent_settled……）没有自带时间，用调用方传入的兜底。
 */
export function resolveEventAt(event: Record<string, unknown>, fallbackAt: string): string {
  const isoTimestamp = getString(event, "timestamp");
  if (isoTimestamp !== undefined) {
    return isoTimestamp;
  }
  const message = getRecord(event, "message");
  const epochMs = message === undefined ? undefined : getFiniteNumber(message, "timestamp");
  return epochMs === undefined ? fallbackAt : new Date(epochMs).toISOString();
}

export function getArray(record: Record<string, unknown>, key: string): unknown[] | undefined {
  const value = record[key];
  return Array.isArray(value) ? value : undefined;
}

/**
 * 原样取值，不做任何形状收窄：调用方自己会再判断（例如直接转给 parseUsageDelta/
 * buildToolDetail 这类自带 isRecord 检查的函数）。存在的意义是让取值走「变量 key」的
 * 索引访问——按 tsconfig 的 noPropertyAccessFromIndexSignature，Record<string, unknown>
 * 不能用点号读字段，只能用方括号；但方括号配字符串字面量又会被 biome 的
 * useLiteralKeys 建议改回点号，两边要求正好相反。用这个函数转一手，两边都满足。
 */
export function getUnknown(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

/** 工具调用摘要压成一行的字符上限。 */
const SUMMARY_MAX_CHARS = 160;

/** pi 侧摘要字段优先级：谁先出现在参数里就用谁（对应模块设计 4.4 节末尾那张表）。 */
const SUMMARY_FIELD_PRIORITY = ["path", "file_path", "command", "query", "url", "pattern"] as const;

/** JSON.stringify 的安全版本：参数来自 JSON.parse 的结果，理论上不会抛，这里再兜一层底。 */
function safeStringify(value: unknown, indent?: number): string {
  try {
    return JSON.stringify(value, null, indent) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * 工具调用摘要：按字段优先级取第一个存在的字符串值压成一行；
 * 都没有命中就把整份参数压成一行兜底。
 */
export function buildToolCallSummary(rawArguments: unknown): string {
  if (isRecord(rawArguments)) {
    for (const field of SUMMARY_FIELD_PRIORITY) {
      const value = getString(rawArguments, field);
      if (value !== undefined) {
        return oneLine(value, SUMMARY_MAX_CHARS);
      }
    }
  }
  return oneLine(safeStringify(rawArguments), SUMMARY_MAX_CHARS);
}

/** 工具调用详情：参数的格式化 JSON；参数是空对象时没有更多信息可看，给 null。 */
export function buildToolDetail(rawArguments: unknown): string | null {
  if (isRecord(rawArguments) && Object.keys(rawArguments).length === 0) {
    return null;
  }
  return truncateText(safeStringify(rawArguments, 2), TOOL_DETAIL_MAX).text;
}

/** 工具结果预览：content 数组里所有文本项拼接后按共同规则截断。 */
export function buildToolResultPreview(rawContent: unknown): Truncated {
  const items = Array.isArray(rawContent) ? rawContent : [];
  const text = items
    .filter(isRecord)
    .filter((item) => getString(item, "type") === "text")
    .map((item) => getString(item, "text") ?? "")
    .join("");
  return truncateText(text, TOOL_RESULT_PREVIEW_MAX);
}

/**
 * message_end 且 role === "toolResult" 那一整条：纯数据转换，不碰任何 reducer 状态，
 * 缺 callId/toolName 就当成认不出这条消息，不产出事件。
 */
export function buildToolResultDraft(
  message: Record<string, unknown>,
  at: string,
): TimelineDraft[] {
  const callId = getString(message, "toolCallId");
  const tool = getString(message, "toolName");
  if (callId === undefined || tool === undefined) {
    return [];
  }
  const ok = !(getBoolean(message, "isError") ?? false);
  const preview = buildToolResultPreview(getUnknown(message, "content"));
  return [
    {
      kind: "tool_result",
      at,
      callId,
      tool,
      ok,
      preview: preview.text,
      truncated: preview.truncated,
    },
  ];
}

/** auto_retry_start 那一整条：attempt/max 用调用方给的连续失败计数和上限，不是 pi 自己的 1~3。 */
export function buildRetryDraft(
  event: Record<string, unknown>,
  at: string,
  attempt: number,
  max: number,
): TimelineDraft[] {
  const delayMs = getFiniteNumber(event, "delayMs") ?? null;
  const message = getString(event, "errorMessage") ?? "未知错误";
  return [{ kind: "retry", at, attempt, max, delayMs, message }];
}

/** compaction_end：只有带 errorMessage 才算失败，产出一条 error；压缩成功没有事件。 */
export function buildCompactionErrorDraft(
  event: Record<string, unknown>,
  at: string,
): TimelineDraft[] {
  const errorMessage = getString(event, "errorMessage");
  return errorMessage === undefined
    ? []
    : [{ kind: "error", at, message: `上下文压缩失败：${errorMessage}` }];
}

/**
 * 一条助手消息 stopReason === "error" 之后要更新的两样东西：新的 retry 信息，
 * 以及——只有连续失败次数达到上限才有——判定放弃的结局。未达上限时 outcome 为 null，
 * 由调用方自己决定这时候阶段是不是该进 "ended"。
 */
export function describeAssistantError(
  consecutiveFailures: number,
  errorMessage: string,
  maxConsecutiveFailures: number,
): { retry: RetryInfo; outcome: RunOutcome | null } {
  const retry: RetryInfo = {
    attempt: consecutiveFailures,
    max: maxConsecutiveFailures,
    message: errorMessage,
  };
  if (consecutiveFailures < maxConsecutiveFailures) {
    return { retry, outcome: null };
  }
  return {
    retry,
    outcome: {
      status: "failed",
      reason: "model_error",
      message: `通道连续 ${maxConsecutiveFailures} 次请求失败：${errorMessage}`,
    },
  };
}

/** agent_settled 时结局还没定：按模块设计 4.5 节，按最后一个 stopReason 兜底判定。 */
export function decideSettledOutcome(
  lastStopReason: string | null,
  lastErrorMessage: string | null,
): RunOutcome {
  if (lastStopReason === "error") {
    return { status: "failed", reason: "model_error", message: lastErrorMessage ?? "未知错误" };
  }
  if (lastStopReason === "aborted") {
    return { status: "failed", reason: "runtime_error", message: "模型调用被中止" };
  }
  return { status: "completed" };
}

/** 助手消息 content 数组里一项的解读结果；不认识的项/空文本项为 null。 */
export type ContentItemResult =
  | { kind: "text"; draftText: string; finalText: string }
  | { kind: "thinking"; draftText: string }
  | { kind: "tool_call"; callId: string; tool: string; summary: string; detail: string | null };

/**
 * 解读 content 数组里的一项：text/thinking 去掉首尾空白、空文本按「没有」处理；
 * toolCall 顺带算好摘要和详情。是否更新「最近活动」、要不要把 draftText 包成时间线事件，
 * 交给 reducer.ts（那边才知道当前的 at、是否需要碰 this.#activity）。
 */
export function describeContentItem(item: Record<string, unknown>): ContentItemResult | null {
  const itemType = getString(item, "type");
  if (itemType === "text") {
    const text = getString(item, "text");
    const trimmed = text?.trim();
    if (trimmed === undefined || trimmed === "") {
      return null;
    }
    return {
      kind: "text",
      draftText: truncateText(trimmed, TEXT_EVENT_MAX).text,
      finalText: trimmed,
    };
  }
  if (itemType === "thinking") {
    const thinking = getString(item, "thinking");
    const trimmed = thinking?.trim();
    if (trimmed === undefined || trimmed === "") {
      return null;
    }
    return { kind: "thinking", draftText: truncateText(trimmed, TEXT_EVENT_MAX).text };
  }
  if (itemType === "toolCall") {
    const callId = getString(item, "id");
    const tool = getString(item, "name");
    if (callId === undefined || tool === undefined) {
      return null;
    }
    const rawArguments = getUnknown(item, "arguments") ?? {};
    return {
      kind: "tool_call",
      callId,
      tool,
      summary: buildToolCallSummary(rawArguments),
      detail: buildToolDetail(rawArguments),
    };
  }
  return null;
}

/**
 * 把一条助手消息的 usage 原始字段整理成一份「本条增量」，交给 addUsage 去累加。
 * 数字字段不是有限数就按 0；总量缺省时按前四项之和；费用不是有限数就是 null（不贡献增量）。
 */
export function parseUsageDelta(rawUsage: unknown): Usage {
  if (!isRecord(rawUsage)) {
    return ZERO_USAGE;
  }
  const inputTokens = getFiniteNumber(rawUsage, "input") ?? 0;
  const outputTokens = getFiniteNumber(rawUsage, "output") ?? 0;
  const cacheReadTokens = getFiniteNumber(rawUsage, "cacheRead") ?? 0;
  const cacheWriteTokens = getFiniteNumber(rawUsage, "cacheWrite") ?? 0;
  const totalTokens =
    getFiniteNumber(rawUsage, "totalTokens") ??
    inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  const cost = getRecord(rawUsage, "cost");
  const costUsd = cost === undefined ? null : (getFiniteNumber(cost, "total") ?? null);
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens, costUsd };
}
