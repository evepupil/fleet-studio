/**
 * 工具调用的摘要与详情文本。
 * 摘要给看板一眼看清"这次调用大概是干什么"；详情是完整参数，供展开查看。
 * 两者都从 opencode tool_use 事件里 part.state.input 这个参数对象算出来。
 */

import { TOOL_DETAIL_MAX } from "../../domain/timeline.js";
import { oneLine, truncateText } from "../text.js";

/** 摘要最长字符数：跟模块设计文档第 3 节的通用规则一致。 */
const SUMMARY_MAX = 160;

/**
 * 按这个顺序取参数里第一个存在的字段值当摘要。
 * 顺序来自模块设计文档第 5.3 节末尾，对应 opencode 内置工具（write/read/bash/grep/webfetch 等）常见的参数命名。
 */
const SUMMARY_FIELD_PRIORITY = [
  "filePath",
  "path",
  "command",
  "pattern",
  "query",
  "url",
  "description",
] as const;

export interface ToolCallSummary {
  summary: string;
  detail: string | null;
}

function isEmptyObject(args: Record<string, unknown>): boolean {
  return Object.keys(args).length === 0;
}

/** 优先级字段里第一个字符串值压成一行；都没有就把整个参数对象的 JSON 压成一行。 */
function summarizeArgs(args: Record<string, unknown>): string {
  for (const field of SUMMARY_FIELD_PRIORITY) {
    const value = args[field];
    if (typeof value === "string") {
      return oneLine(value, SUMMARY_MAX);
    }
  }
  return oneLine(JSON.stringify(args), SUMMARY_MAX);
}

/** 参数的格式化 JSON（两空格缩进），截到 TOOL_DETAIL_MAX；空对象时没有更多信息可看，为 null。 */
function detailOf(args: Record<string, unknown>): string | null {
  if (isEmptyObject(args)) {
    return null;
  }
  return truncateText(JSON.stringify(args, null, 2), TOOL_DETAIL_MAX).text;
}

/** 生成一次工具调用的摘要和详情。 */
export function summarizeToolCall(args: Record<string, unknown>): ToolCallSummary {
  return { summary: summarizeArgs(args), detail: detailOf(args) };
}
