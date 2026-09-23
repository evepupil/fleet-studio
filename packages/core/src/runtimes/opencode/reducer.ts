/**
 * opencode `run --format json` 事件流解析器。规则见模块设计文档《核心层 · 运行时适配》
 * 第 3 节（共同规则）和第 5.3 节（opencode 事件对照）。
 *
 * 设计前提：opencode 每一行都是独立 JSON，带 type/timestamp/sessionID 三个顶层字段；
 * 没有专门的"运行结束"事件，阶段永远停在 starting/working，结局由外部进程退出兜底判断
 * （见 lifecycle/outcome.ts）。这里只负责把一行行输出，翻译成看板认识的时间线事件。
 *
 * 取值都走下面这组 getXxx 辅助函数：项目开了 noPropertyAccessFromIndexSignature，
 * 索引签名类型必须用方括号读字段；但方括号配字面量字符串又会被 biome 的
 * useLiteralKeys 规则要求"简化"成点号——两条规则互相矛盾。统一让 key 走一个
 * 字符串参数（record[key]，key 是变量不是字面量），两条规则就都满足了。
 */
import {
  TEXT_EVENT_MAX,
  type TimelineDraft,
  TOOL_RESULT_PREVIEW_MAX,
} from "../../domain/timeline.js";
import { addUsage, type Usage, ZERO_USAGE } from "../../domain/usage.js";
import { tailLines, truncateText } from "../text.js";
import type { OutputStream, RunOutcome, RunProgress, StreamReducer } from "../types.js";
import { summarizeToolCall } from "./summarize.js";

/** 未知 JSON 的最小收窄：一个非 null、非数组的对象。 */
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getUnknown(record: JsonRecord, key: string): unknown {
  return record[key];
}

function getString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function getFiniteNumber(record: JsonRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getRecord(record: JsonRecord, key: string): JsonRecord | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

/** JSON.parse 成功时永远不会是 undefined，拿它当"解析失败"的哨兵值。 */
function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

/** 事件行自带可用时间戳（有限数的毫秒值）时转成 ISO；否则用调用方传入的 at。 */
function resolveEventAt(timestampMs: number | undefined, fallback: string): string {
  if (timestampMs === undefined) {
    return fallback;
  }
  try {
    return new Date(timestampMs).toISOString();
  } catch {
    // 极端越界数值会让 toISOString 抛异常；退回调用方给的时间，不让这种边界情况中断解析。
    return fallback;
  }
}

/** step_finish.part.tokens/cost 换算成一次 Usage；数字字段缺失或非有限数按 0，费用非有限数按 null（未知）。 */
function extractStepUsage(part: JsonRecord): Usage {
  const tokens = getRecord(part, "tokens") ?? {};
  const cache = getRecord(tokens, "cache") ?? {};
  return {
    inputTokens: getFiniteNumber(tokens, "input") ?? 0,
    outputTokens: getFiniteNumber(tokens, "output") ?? 0,
    cacheReadTokens: getFiniteNumber(cache, "read") ?? 0,
    cacheWriteTokens: getFiniteNumber(cache, "write") ?? 0,
    totalTokens: getFiniteNumber(tokens, "total") ?? 0,
    costUsd: getFiniteNumber(part, "cost") ?? null,
  };
}

/** tool_use 的结果预览：state.output 是字符串就用它，否则 state.error 的文字，都没有就空字符串。 */
function resultPreview(state: JsonRecord): string {
  return getString(state, "output") ?? getString(state, "error") ?? "";
}

/** error 事件的说明：error.data.message、error.message、error.name 依次取第一个字符串值，都没有就用 error 的 JSON。 */
function describeOpencodeError(errorValue: unknown): string {
  if (isRecord(errorValue)) {
    const data = getRecord(errorValue, "data");
    const dataMessage = data === undefined ? undefined : getString(data, "message");
    if (dataMessage !== undefined) {
      return dataMessage;
    }
    const message = getString(errorValue, "message");
    if (message !== undefined) {
      return message;
    }
    const name = getString(errorValue, "name");
    if (name !== undefined) {
      return name;
    }
  }
  const json = JSON.stringify(errorValue);
  return typeof json === "string" ? json : "未知错误";
}

/** text/reasoning 共用：取 part.text，part 不是对象或没有这个字符串字段时为 undefined。 */
function getPartText(event: JsonRecord): string | undefined {
  const part = getRecord(event, "part");
  return part === undefined ? undefined : getString(part, "text");
}

export function createOpencodeReducer(): StreamReducer {
  let sessionRef: string | null = null;
  let phase: RunProgress["phase"] = "starting";
  let outcome: RunOutcome | null = null;
  let usage: Usage = ZERO_USAGE;
  let activity: string | null = null;
  let lastEventAt: string | null = null;
  let finalText: string | null = null;
  let plainOutputTail: string | null = null;
  let eventCount = 0;
  /** 当前这一步（上一次 step_start 之后）出现过的 text 内容，原文保存，供 finalText 拼接。 */
  let stepTexts: string[] = [];
  /** 原始输出尾巴的来源行，只留最后 5 行。 */
  let plainLines: string[] = [];

  function pushPlainOutput(line: string, stream: OutputStream, at: string): TimelineDraft[] {
    plainLines = [...plainLines, line].slice(-5);
    plainOutputTail = tailLines(plainLines.join("\n"), 5, 500);
    lastEventAt = at;
    return [{ kind: "output", at, stream, text: truncateText(line, TEXT_EVENT_MAX).text }];
  }

  function handleText(event: JsonRecord, at: string): TimelineDraft[] {
    const text = getPartText(event);
    if (text === undefined || text.length === 0) {
      return [];
    }
    stepTexts = [...stepTexts, text];
    return [{ kind: "text", at, text: truncateText(text, TEXT_EVENT_MAX).text }];
  }

  function handleReasoning(event: JsonRecord, at: string): TimelineDraft[] {
    const text = getPartText(event);
    if (text === undefined || text.length === 0) {
      return [];
    }
    return [{ kind: "thinking", at, text: truncateText(text, TEXT_EVENT_MAX).text }];
  }

  function handleToolUse(event: JsonRecord, at: string): TimelineDraft[] {
    const part = getRecord(event, "part");
    if (part === undefined) {
      throw new Error("tool_use 事件缺少 part 字段");
    }
    const tool = getString(part, "tool");
    if (tool === undefined) {
      throw new Error("tool_use 事件缺少 tool 字段");
    }
    const callId = getString(part, "callID") ?? getString(part, "id");
    if (callId === undefined) {
      throw new Error("tool_use 事件缺少 callID/id 字段");
    }
    const state = getRecord(part, "state") ?? {};
    const input = getRecord(state, "input") ?? {};

    const { summary, detail } = summarizeToolCall(input);
    activity = `${tool} · ${summary}`;
    const callDraft: TimelineDraft = { kind: "tool_call", at, callId, tool, summary, detail };

    const preview = truncateText(resultPreview(state), TOOL_RESULT_PREVIEW_MAX);
    const resultDraft: TimelineDraft = {
      kind: "tool_result",
      at,
      callId,
      tool,
      ok: getString(state, "status") === "completed",
      preview: preview.text,
      truncated: preview.truncated,
    };
    return [callDraft, resultDraft];
  }

  function handleStepFinish(event: JsonRecord): void {
    const part = getRecord(event, "part") ?? {};
    usage = addUsage(usage, extractStepUsage(part));
    if (stepTexts.length > 0) {
      finalText = stepTexts.join("\n\n");
    }
    if (getString(part, "reason") === "stop" && outcome === null) {
      outcome = { status: "completed" };
    }
  }

  function handleError(event: JsonRecord, at: string): TimelineDraft[] {
    const message = describeOpencodeError(getUnknown(event, "error"));
    // 无条件覆盖：哪怕上一步已经暂定"已完成"，真正的致命错误也要改判失败。
    outcome = { status: "failed", reason: "model_error", message };
    return [{ kind: "error", at, message }];
  }

  function dispatch(type: string, event: JsonRecord, at: string): TimelineDraft[] {
    switch (type) {
      case "step_start":
        stepTexts = [];
        phase = "working";
        return [];
      case "text":
        return handleText(event, at);
      case "reasoning":
        return handleReasoning(event, at);
      case "tool_use":
        return handleToolUse(event, at);
      case "step_finish":
        handleStepFinish(event);
        return [];
      case "error":
        return handleError(event, at);
      default:
        // 完全不认识的类型：不产出事件，也不算错误。
        return [];
    }
  }

  function pushEvent(event: JsonRecord, type: string, fallbackAt: string): TimelineDraft[] {
    const at = resolveEventAt(getFiniteNumber(event, "timestamp"), fallbackAt);
    lastEventAt = at;
    const sessionID = getString(event, "sessionID");
    if (sessionRef === null && sessionID !== undefined) {
      sessionRef = sessionID;
    }
    try {
      return dispatch(type, event, at);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return [{ kind: "error", at, message: `解析事件出错：${reason}` }];
    }
  }

  function push(line: string, stream: OutputStream, at: string): TimelineDraft[] {
    if (line.trim().length === 0) {
      return [];
    }
    const parsed = parseJsonLine(line);
    const type = isRecord(parsed) ? getString(parsed, "type") : undefined;
    const drafts =
      isRecord(parsed) && type !== undefined
        ? pushEvent(parsed, type, at)
        : pushPlainOutput(line, stream, at);
    eventCount += drafts.length;
    return drafts;
  }

  function progress(): RunProgress {
    return {
      sessionRef,
      phase,
      outcome,
      retry: null,
      usage,
      activity,
      lastEventAt,
      finalText,
      plainOutputTail,
      model: null,
      eventCount,
    };
  }

  return { push, progress };
}
