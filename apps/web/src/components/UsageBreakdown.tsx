import type { Usage } from "@fleet/core";
import { formatTokens } from "@/lib/format";

function UsageBreakdown({ usage }: { usage: Usage }) {
  return (
    <span data-usage-breakdown className="flex flex-wrap gap-x-2 text-12">
      <span className="whitespace-nowrap">
        输入 <span className="font-mono tabular-nums">{formatTokens(usage.inputTokens)}</span>
      </span>
      <span aria-hidden className="whitespace-nowrap">
        · 输出 <span className="font-mono tabular-nums">{formatTokens(usage.outputTokens)}</span>
      </span>
      <span aria-hidden className="whitespace-nowrap">
        · 缓存 <span className="font-mono tabular-nums">{formatTokens(usage.cacheReadTokens)}</span>
      </span>
    </span>
  );
}

export { UsageBreakdown };
