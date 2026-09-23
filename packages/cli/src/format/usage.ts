import type { Usage } from "@fleet/core";

/**
 * 用量与费用的一行摘要；费用未知（null）或者是 0 时都不显示费用这一项（缺陷 6：和看板
 * apps/web/src/lib/format.ts 的 formatCost 一致，没有费用不该显示成「费用 $0.0000」）。
 * 大于 0 时的具体格式不变（4 位小数）。
 */
export function formatUsage(usage: Usage): string {
  const tokens = `输入 ${usage.inputTokens} · 输出 ${usage.outputTokens} · 缓存读 ${usage.cacheReadTokens} · 缓存写 ${usage.cacheWriteTokens} · 合计 ${usage.totalTokens}`;
  const cost =
    usage.costUsd !== null && usage.costUsd > 0 ? ` · 费用 $${usage.costUsd.toFixed(4)}` : "";
  return `${tokens}${cost}`;
}
