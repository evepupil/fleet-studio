/**
 * pi `--mode json` 事件流解析器：逐行喂入 stdout/stderr，永不抛异常。
 * 具体规则见 docs/模块设计/核心层-运行时适配.md 第 3、4 节；事实依据见
 * docs/调研/pi-运行时.md 第 3、4 节。
 */

import type { RetryInfo } from "../../domain/records.js";
import type { TimelineDraft } from "../../domain/timeline.js";
import { TEXT_EVENT_MAX } from "../../domain/timeline.js";
import type { Usage } from "../../domain/usage.js";
import { addUsage, ZERO_USAGE } from "../../domain/usage.js";
import { tailLines, truncateText } from "../text.js";
import type { OutputStream, RunOutcome, RunProgress, StreamReducer } from "../types.js";
import {
  buildCompactionErrorDraft,
  buildRetryDraft,
  buildToolResultDraft,
  decideSettledOutcome,
  describeAssistantError,
  describeContentItem,
  getArray,
  getRecord,
  getString,
  getUnknown,
  isRecord,
  parseUsageDelta,
  resolveEventAt,
} from "./summarize.js";

/** 通道持续报错时，连续失败这么多次就判定放弃——不能指望 pi 自己会放弃（见调研第 4 节）。 */
export const PI_MAX_CONSECUTIVE_FAILURES = 8;

/** 原始输出尾巴最多保留的行数与总字符数（模块设计第 3 节）。 */
const RAW_OUTPUT_TAIL_LINES = 5;
const RAW_OUTPUT_TAIL_CHARS = 500;

/** pi 事件流的解析状态机：一次运行一个实例。 */
class PiStreamReducer implements StreamReducer {
  #sessionRef: string | null = null;
  #phase: RunProgress["phase"] = "starting";
  #outcome: RunOutcome | null = null;
  #retry: RetryInfo | null = null;
  #usage: Usage = ZERO_USAGE;
  #activity: string | null = null;
  #lastEventAt: string | null = null;
  #finalText: string | null = null;
  #plainOutputTail: string | null = null;
  #model: string | null = null;
  #eventCount = 0;
  #consecutiveFailures = 0;
  #lastStopReason: string | null = null;
  #lastErrorMessage: string | null = null;
  #rawOutputLines: string[] = [];

  push(line: string, stream: OutputStream, at: string): TimelineDraft[] {
    if (line.trim() === "") {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return this.#recordPlainOutput(line, stream, at);
    }

    if (!isRecord(parsed) || getString(parsed, "type") === undefined) {
      return this.#recordPlainOutput(line, stream, at);
    }

    const resolvedAt = resolveEventAt(parsed, at);
    this.#lastEventAt = resolvedAt;

    try {
      const drafts = this.#dispatch(parsed, resolvedAt);
      this.#eventCount += drafts.length;
      return drafts;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.#eventCount += 1;
      return [{ kind: "error", at: resolvedAt, message: `解析事件出错：${reason}` }];
    }
  }

  progress(): RunProgress {
    return {
      sessionRef: this.#sessionRef,
      phase: this.#phase,
      outcome: this.#outcome,
      retry: this.#retry,
      usage: this.#usage,
      activity: this.#activity,
      lastEventAt: this.#lastEventAt,
      finalText: this.#finalText,
      plainOutputTail: this.#plainOutputTail,
      model: this.#model,
      eventCount: this.#eventCount,
    };
  }

  /** 不是事件 JSON 的一行：产出 output 事件，并计入原始输出尾巴。 */
  #recordPlainOutput(line: string, stream: OutputStream, at: string): TimelineDraft[] {
    this.#lastEventAt = at;
    this.#rawOutputLines.push(line);
    if (this.#rawOutputLines.length > RAW_OUTPUT_TAIL_LINES) {
      this.#rawOutputLines = this.#rawOutputLines.slice(-RAW_OUTPUT_TAIL_LINES);
    }
    this.#plainOutputTail = tailLines(
      this.#rawOutputLines.join("\n"),
      RAW_OUTPUT_TAIL_LINES,
      RAW_OUTPUT_TAIL_CHARS,
    );
    this.#eventCount += 1;
    return [{ kind: "output", at, stream, text: truncateText(line, TEXT_EVENT_MAX).text }];
  }

  /** 认识类型就按类型分发；不认识的类型和纯状态位事件一样，什么都不产出。 */
  #dispatch(event: Record<string, unknown>, at: string): TimelineDraft[] {
    switch (getString(event, "type")) {
      case "session": {
        const id = getString(event, "id");
        if (id !== undefined) {
          this.#sessionRef = id;
        }
        return [];
      }
      case "agent_start":
        if (this.#phase === "starting") {
          this.#phase = "working";
        }
        return [];
      case "message_end":
        return this.#handleMessageEnd(event, at);
      case "auto_retry_start":
        return buildRetryDraft(event, at, this.#consecutiveFailures, PI_MAX_CONSECUTIVE_FAILURES);
      case "compaction_end":
        return buildCompactionErrorDraft(event, at);
      case "agent_settled":
        this.#finalizeSettled();
        return [];
      default:
        // turn_start/turn_end、message_start/message_update、agent_end、auto_retry_end、
        // tool_execution_*、entry_appended、compaction_start、model_change、
        // thinking_level_change，以及任何未来才有的新类型：都不产出事件。
        return [];
    }
  }

  #handleMessageEnd(event: Record<string, unknown>, at: string): TimelineDraft[] {
    const message = getRecord(event, "message");
    if (message === undefined) {
      return [];
    }
    const role = getString(message, "role");
    if (role === "assistant") {
      return this.#handleAssistantMessage(message, at);
    }
    if (role === "toolResult") {
      return buildToolResultDraft(message, at);
    }
    return [];
  }

  /** 一条完整的最终助手消息：更新模型名/用量，按内容顺序产出事件，再按 stopReason 收尾。 */
  #handleAssistantMessage(message: Record<string, unknown>, at: string): TimelineDraft[] {
    const drafts: TimelineDraft[] = [];

    const provider = getString(message, "provider");
    const model = getString(message, "model");
    if (provider !== undefined && model !== undefined) {
      this.#model = `${provider}/${model}`;
    }
    this.#usage = addUsage(this.#usage, parseUsageDelta(getUnknown(message, "usage")));

    const textItems: string[] = [];
    for (const item of getArray(message, "content") ?? []) {
      if (isRecord(item)) {
        this.#handleContentItem(item, at, drafts, textItems);
      }
    }

    const stopReason = getString(message, "stopReason");
    if (stopReason === "error") {
      this.#handleAssistantError(message, at, drafts);
    } else {
      if (stopReason !== undefined) {
        this.#lastStopReason = stopReason;
      }
      this.#consecutiveFailures = 0;
      this.#retry = null;
      this.#phase = "working";
      if (textItems.length > 0) {
        this.#finalText = textItems.join("\n\n");
      }
    }

    return drafts;
  }

  /** content 数组里的一项：text/thinking 直接产出事件，toolCall 还要顺带更新「最近活动」。 */
  #handleContentItem(
    item: Record<string, unknown>,
    at: string,
    drafts: TimelineDraft[],
    textItems: string[],
  ): void {
    const result = describeContentItem(item);
    if (result === null) {
      return;
    }
    if (result.kind === "text") {
      // finalText 和展示用的 text 事件统一用去掉首尾空白后的文本，两处保持一致。
      textItems.push(result.finalText);
      drafts.push({ kind: "text", at, text: result.draftText });
    } else if (result.kind === "thinking") {
      drafts.push({ kind: "thinking", at, text: result.draftText });
    } else {
      this.#activity = `${result.tool} · ${result.summary}`;
      drafts.push({
        kind: "tool_call",
        at,
        callId: result.callId,
        tool: result.tool,
        summary: result.summary,
        detail: result.detail,
      });
    }
  }

  /** stopReason === "error"：计一次连续失败，达到上限就直接判定放弃（判定逻辑在 summarize.ts）。 */
  #handleAssistantError(
    message: Record<string, unknown>,
    at: string,
    drafts: TimelineDraft[],
  ): void {
    this.#consecutiveFailures += 1;
    const errorMessage = getString(message, "errorMessage") ?? "未知错误";
    this.#lastStopReason = "error";
    this.#lastErrorMessage = errorMessage;
    drafts.push({ kind: "error", at, message: errorMessage });

    const { retry, outcome } = describeAssistantError(
      this.#consecutiveFailures,
      errorMessage,
      PI_MAX_CONSECUTIVE_FAILURES,
    );
    this.#retry = retry;
    if (outcome === null) {
      this.#phase = "retrying";
    } else {
      this.#outcome = outcome;
      this.#phase = "ended";
    }
  }

  /** agent_settled：事件流已经彻底安定。结局还没定的话，按最后一个 stopReason 兜底判定。 */
  #finalizeSettled(): void {
    this.#phase = "ended";
    if (this.#outcome === null) {
      this.#outcome = decideSettledOutcome(this.#lastStopReason, this.#lastErrorMessage);
    }
  }
}

/** 每次运行都要一个全新的解析器实例，内部状态不跨运行共享。 */
export function createPiReducer(): StreamReducer {
  return new PiStreamReducer();
}
