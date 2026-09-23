import type { Usage } from "@fleet/core";

/** 用量与费用的一行摘要；费用未知（costUsd 为 null）时不显示费用部分。 */
export function formatUsage(usage: Usage): string {
  const tokens = `输入 ${usage.inputTokens} · 输出 ${usage.outputTokens} · 缓存读 ${usage.cacheReadTokens} · 缓存写 ${usage.cacheWriteTokens} · 合计 ${usage.totalTokens}`;
  const cost = usage.costUsd !== null ? ` · 费用 $${usage.costUsd.toFixed(4)}` : "";
  return `${tokens}${cost}`;
}
