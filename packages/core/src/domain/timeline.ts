import type { FailReason, RunStatus } from "./status.js";

interface TimelineBase {
  /** 在整个苦工时间线里的位置，从 0 开始，连续递增，跨多次运行不重置 */
  seq: number;
  /** 属于第几次运行 */
  runSeq: number;
  /** ISO 8601 UTC 时间 */
  at: string;
}

/**
 * 看板和 fleet log 展示的时间线事件。
 * run_start / run_end 由服务在拼接多次运行时插入；其余由运行时解析器产出。
 */
export type TimelineEvent =
  | (TimelineBase & { kind: "run_start"; prompt: string })
  | (TimelineBase & { kind: "text"; text: string })
  | (TimelineBase & { kind: "thinking"; text: string })
  | (TimelineBase & {
      kind: "tool_call";
      callId: string;
      tool: string;
      /** 一行摘要，例如 packages/core/src/index.ts 或 pnpm test */
      summary: string;
      /** 完整参数的可读文本（已截断），没有更多信息时为 null */
      detail: string | null;
    })
  | (TimelineBase & {
      kind: "tool_result";
      callId: string;
      tool: string;
      ok: boolean;
      /** 结果预览，最多 TOOL_RESULT_PREVIEW_MAX 个字符 */
      preview: string;
      truncated: boolean;
    })
  | (TimelineBase & {
      kind: "retry";
      attempt: number;
      max: number;
      delayMs: number | null;
      message: string;
    })
  | (TimelineBase & { kind: "error"; message: string })
  | (TimelineBase & {
      kind: "output";
      /** 不是事件格式的原始输出，例如运行时打印的错误提示 */
      stream: "stdout" | "stderr";
      text: string;
    })
  | (TimelineBase & {
      kind: "run_end";
      status: RunStatus;
      failReason: FailReason | null;
      message: string | null;
    });

export type TimelineKind = TimelineEvent["kind"];

/** 对联合类型逐个成员做 Omit（内置 Omit 会把联合压扁）。 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** 解析器产出的事件：还没有 seq 和 runSeq，由服务拼接时补上。 */
export type TimelineDraft = DistributiveOmit<TimelineEvent, "seq" | "runSeq">;

/** 工具结果预览的最大字符数 */
export const TOOL_RESULT_PREVIEW_MAX = 2000;
/** 工具参数详情的最大字符数 */
export const TOOL_DETAIL_MAX = 4000;
/** 文字、思考、原始输出类事件单条的最大字符数 */
export const TEXT_EVENT_MAX = 20000;
