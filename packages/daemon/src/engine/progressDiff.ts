import type { RetryInfo, RunOutcome, RunProgress, Usage } from "@fleet/core";

function usageEquals(a: Usage, b: Usage): boolean {
  return (
    a.inputTokens === b.inputTokens &&
    a.outputTokens === b.outputTokens &&
    a.cacheReadTokens === b.cacheReadTokens &&
    a.cacheWriteTokens === b.cacheWriteTokens &&
    a.totalTokens === b.totalTokens &&
    a.costUsd === b.costUsd
  );
}

function retryEquals(a: RetryInfo | null, b: RetryInfo | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.attempt === b.attempt && a.max === b.max && a.message === b.message;
}

/** outcome 的形状很小（一两个短字段），直接比较序列化结果比手写每个分支的判别式更不容易漏字段。 */
function outcomeEquals(a: RunOutcome | null, b: RunOutcome | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 阶段、重试信息、暂定结局中任意一项变化：这类变化要立即落库，不受每秒一次的节流限制
 * （模块设计 3.6.3）。
 */
export function isCriticalProgressChange(a: RunProgress, b: RunProgress): boolean {
  return (
    a.phase !== b.phase || !retryEquals(a.retry, b.retry) || !outcomeEquals(a.outcome, b.outcome)
  );
}

/** 落库相关的任意字段（含上面的关键字段）有没有变化；没变化就不用再写一次库。 */
export function hasProgressChanged(a: RunProgress, b: RunProgress): boolean {
  return (
    isCriticalProgressChange(a, b) ||
    !usageEquals(a.usage, b.usage) ||
    a.activity !== b.activity ||
    a.lastEventAt !== b.lastEventAt ||
    a.finalText !== b.finalText ||
    a.eventCount !== b.eventCount
  );
}
