import type { WorkerSummary } from "@fleet/core";

/**
 * 窗口栏「搜索任务」的纯函数：先在实时快照里按编号和标题找（立刻出结果），
 * 再把接口按标题搜回来的历史任务去重补在后面。
 */

/** 搜索结果最多显示几条 */
export const SEARCH_LIMIT = 8;

function createdMs(worker: WorkerSummary): number {
  const ms = Date.parse(worker.createdAt);
  return Number.isNaN(ms) ? 0 : ms;
}

function newestFirst(a: WorkerSummary, b: WorkerSummary): number {
  const diff = createdMs(b) - createdMs(a);
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 匹配档次：编号完全相同 0、编号前缀 1、标题包含 2；都不中返回 null */
function matchRank(worker: WorkerSummary, query: string): number | null {
  const id = worker.id.toLowerCase();
  if (id === query) return 0;
  if (id.startsWith(query)) return 1;
  if (worker.title.toLowerCase().includes(query)) return 2;
  return null;
}

/**
 * 在快照里找任务。关键词为空时返回最近创建的 limit 个（弹窗打开时的「最近」列表）；
 * 否则按匹配档次排，同档次新创建的在前。匹配不区分大小写，关键词先去掉首尾空白。
 */
export function matchLiveTasks(
  workers: readonly WorkerSummary[],
  query: string,
  limit: number = SEARCH_LIMIT,
): WorkerSummary[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return [...workers].sort(newestFirst).slice(0, limit);
  }
  const ranked: { worker: WorkerSummary; rank: number }[] = [];
  for (const worker of workers) {
    const rank = matchRank(worker, normalized);
    if (rank !== null) ranked.push({ worker, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank || newestFirst(a.worker, b.worker));
  return ranked.slice(0, limit).map((item) => item.worker);
}

/** 快照结果在前（更新鲜），接口结果按原顺序去重补在后面，最多 limit 条 */
export function mergeSearchResults(
  live: readonly WorkerSummary[],
  remote: readonly WorkerSummary[],
  limit: number = SEARCH_LIMIT,
): WorkerSummary[] {
  const seen = new Set<string>();
  const merged: WorkerSummary[] = [];
  for (const worker of [...live, ...remote]) {
    if (seen.has(worker.id)) continue;
    seen.add(worker.id);
    merged.push(worker);
    if (merged.length >= limit) break;
  }
  return merged;
}
