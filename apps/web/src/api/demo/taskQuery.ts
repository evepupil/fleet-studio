import {
  resolveRange,
  type TaskPage,
  type TasksQuery,
  type TimeZone,
  type WorkerSummary,
} from "@fleet/core";

/**
 * 演示源的任务查询：全部在内存里对苦工汇总做筛选、排序、翻页。
 * 口径和真实服务的 /api/tasks 一致（见 docs/模块设计/服务层-存储.md 第 5 节），
 * 只有游标不同：真实服务用 base64url 的 JSON，演示源用页码偏移量的十进制字符串。
 */

/** 翻页游标：就是偏移量本身 */
function parseCursor(cursor: string | undefined): number {
  if (cursor === undefined) {
    return 0;
  }
  if (!/^\d+$/.test(cursor)) {
    throw new Error("翻页参数无效，请从第一页重新加载");
  }
  const offset = Number.parseInt(cursor, 10);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error("翻页参数无效，请从第一页重新加载");
  }
  return offset;
}

/** 状态筛选：active = 排队中 + 工作中；retrying = 工作中且正在自动重试 */
function matchesStatus(summary: WorkerSummary, status: TasksQuery["status"]): boolean {
  switch (status) {
    case "all":
      return true;
    case "active":
      return summary.status === "queued" || summary.status === "running";
    case "retrying":
      return summary.status === "running" && summary.retry !== null;
    default:
      return summary.status === status;
  }
}

/** 标题的不区分大小写包含匹配 */
function matchesTitle(summary: WorkerSummary, query: string): boolean {
  return summary.title.toLowerCase().includes(query.toLowerCase());
}

/** 排序：先按选的键，再按 id 保持同向稳定 */
function compareBy(key: TasksQuery["sort"], order: TasksQuery["order"]) {
  const sign = order === "asc" ? 1 : -1;
  return (a: WorkerSummary, b: WorkerSummary): number => {
    const left =
      key === "createdAt"
        ? Date.parse(a.createdAt)
        : key === "runMs"
          ? a.runMs
          : a.usage.totalTokens;
    const right =
      key === "createdAt"
        ? Date.parse(b.createdAt)
        : key === "runMs"
          ? b.runMs
          : b.usage.totalTokens;
    if (left !== right) {
      return left < right ? -sign : sign;
    }
    if (a.id === b.id) {
      return 0;
    }
    return a.id < b.id ? -sign : sign;
  };
}

/** 演示源的任务查询；`summaries` 是全部苦工的汇总 */
export function queryDemoTasks(
  summaries: readonly WorkerSummary[],
  query: TasksQuery,
  nowMs: number,
  tz: TimeZone,
): TaskPage {
  const range = resolveRange({ kind: query.range, from: query.from, to: query.to }, nowMs, tz);
  const offset = parseCursor(query.cursor);

  const filtered = summaries.filter((summary) => {
    if (!matchesStatus(summary, query.status)) {
      return false;
    }
    if (query.project !== undefined && summary.projectKey !== query.project) {
      return false;
    }
    if (query.pool !== undefined && summary.poolId !== query.pool) {
      return false;
    }
    if (query.role !== undefined && summary.role !== query.role) {
      return false;
    }
    if (query.channel !== undefined && summary.channel !== query.channel) {
      return false;
    }
    if (query.model !== undefined && summary.modelName !== query.model) {
      return false;
    }
    const createdMs = Date.parse(summary.createdAt);
    if (range.fromMs !== null && createdMs < range.fromMs) {
      return false;
    }
    if (createdMs >= range.toMs) {
      return false;
    }
    if (query.q !== undefined && !matchesTitle(summary, query.q)) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered].sort(compareBy(query.sort, query.order));
  const items = sorted.slice(offset, offset + query.limit);
  const nextOffset = offset + query.limit;
  return {
    items,
    nextCursor: nextOffset < sorted.length ? String(nextOffset) : null,
    total: sorted.length,
  };
}
