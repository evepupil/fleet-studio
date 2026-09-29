import { FAIL_REASON_LABELS, type RunStatus, type WorkerSummary } from "@fleet/core";

/**
 * 任务看板的纯函数：按状态分列、列内排序、看板筛选、卡片「进度」小片。
 * 看板数据只来自实时快照（进行中 + 最近 24 小时内结束的任务），不另发请求。
 */

/** 五个状态列从左到右的固定顺序 */
export const BOARD_COLUMN_ORDER: readonly RunStatus[] = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
];

/** 默认收进右侧短行、点开才展开成列的两个状态 */
export const COLLAPSIBLE_COLUMNS = ["failed", "cancelled"] as const;
export type CollapsibleColumn = (typeof COLLAPSIBLE_COLUMNS)[number];

export function isCollapsibleColumn(status: RunStatus): status is CollapsibleColumn {
  return status === "failed" || status === "cancelled";
}

export interface BoardLayout {
  /** 展开成列的状态，按固定顺序 */
  columns: RunStatus[];
  /** 收在右侧短行里的状态，按固定顺序；为空时右侧短行整组不渲染 */
  collapsed: CollapsibleColumn[];
}

/** 排队中、工作中、已完成永远展开；失败、已取消在 expanded 里才展开 */
export function boardLayout(expanded: ReadonlySet<CollapsibleColumn>): BoardLayout {
  return {
    columns: BOARD_COLUMN_ORDER.filter(
      (status) => !isCollapsibleColumn(status) || expanded.has(status),
    ),
    collapsed: COLLAPSIBLE_COLUMNS.filter((status) => !expanded.has(status)),
  };
}

/** 看板认的筛选条件：状态和时间范围对看板不起作用（列本身就是状态，数据只有最近 24 小时） */
export interface BoardFilter {
  project?: string | undefined;
  pool?: string | undefined;
  role?: string | undefined;
  channel?: string | undefined;
  model?: string | undefined;
  q: string;
}

/** 项目、池、角色、渠道、模型逐项精确匹配；标题按不区分大小写的包含匹配（和任务列表的搜索同一语义） */
export function filterBoardWorkers(
  workers: readonly WorkerSummary[],
  filter: BoardFilter,
): WorkerSummary[] {
  const query = filter.q.trim().toLowerCase();
  return workers.filter(
    (worker) =>
      (filter.project === undefined || worker.projectKey === filter.project) &&
      (filter.pool === undefined || worker.poolId === filter.pool) &&
      (filter.role === undefined || worker.role === filter.role) &&
      (filter.channel === undefined || worker.channel === filter.channel) &&
      (filter.model === undefined || worker.modelName === filter.model) &&
      (query.length === 0 || worker.title.toLowerCase().includes(query)),
  );
}

function timeOf(iso: string | null): number {
  if (iso === null) return Number.NEGATIVE_INFINITY;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

function byId(a: WorkerSummary, b: WorkerSummary): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * 排队中：排队位次小的在前（各池的第 1 位、公共排队第 1 位……交错排），同位次点名的在公共排队前，
 * 再按排队时间先后。位次缺失的排最后。
 */
function compareQueued(a: WorkerSummary, b: WorkerSummary): number {
  const pa = a.queuePosition ?? Number.POSITIVE_INFINITY;
  const pb = b.queuePosition ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa - pb;
  const sharedA = a.poolId === null ? 1 : 0;
  const sharedB = b.poolId === null ? 1 : 0;
  if (sharedA !== sharedB) return sharedA - sharedB;
  const qa = timeOf(a.queuedAt);
  const qb = timeOf(b.queuedAt);
  if (qa !== qb) return qa - qb;
  return byId(a, b);
}

/** 工作中：最近开跑的在前 */
function compareRunning(a: WorkerSummary, b: WorkerSummary): number {
  const sa = timeOf(a.startedAt);
  const sb = timeOf(b.startedAt);
  if (sa !== sb) return sb - sa;
  return byId(a, b);
}

/** 已结束的三列：最近结束的在前 */
function compareEnded(a: WorkerSummary, b: WorkerSummary): number {
  const ea = timeOf(a.endedAt);
  const eb = timeOf(b.endedAt);
  if (ea !== eb) return eb - ea;
  return byId(a, b);
}

const COMPARATORS: Readonly<Record<RunStatus, (a: WorkerSummary, b: WorkerSummary) => number>> = {
  queued: compareQueued,
  running: compareRunning,
  completed: compareEnded,
  failed: compareEnded,
  cancelled: compareEnded,
};

/** 按最新一次运行的状态分进五列，每列按上面的规则排好序 */
export function groupBoardColumns(
  workers: readonly WorkerSummary[],
): Record<RunStatus, WorkerSummary[]> {
  const columns: Record<RunStatus, WorkerSummary[]> = {
    queued: [],
    running: [],
    completed: [],
    failed: [],
    cancelled: [],
  };
  for (const worker of workers) {
    columns[worker.status].push(worker);
  }
  for (const status of BOARD_COLUMN_ORDER) {
    columns[status].sort(COMPARATORS[status]);
  }
  return columns;
}

/** 卡片第三行最前面的「进度」小片 */
export type CardMeta =
  /** 排队中：「排队第 N 位」或「公共排队第 N 位」 */
  | { kind: "queue"; text: string }
  /** 工作中：从开跑时刻起实时走的时长 */
  | { kind: "elapsed"; from: string }
  /** 工作中且正在自动重试：「重试 N/M」 */
  | { kind: "retry"; text: string }
  /** 已完成、已取消：真正在跑的总时长 */
  | { kind: "duration"; ms: number }
  /** 失败：失败原因的中文说明 */
  | { kind: "failure"; text: string };

export function cardMeta(worker: WorkerSummary): CardMeta | null {
  switch (worker.status) {
    case "queued":
      if (worker.queuePosition === null) return null;
      return {
        kind: "queue",
        text: `${worker.poolId === null ? "公共排队" : "排队"}第 ${worker.queuePosition} 位`,
      };
    case "running":
      if (worker.retry !== null) {
        return { kind: "retry", text: `重试 ${worker.retry.attempt}/${worker.retry.max}` };
      }
      return worker.startedAt === null ? null : { kind: "elapsed", from: worker.startedAt };
    case "failed":
      return worker.failReason === null
        ? null
        : { kind: "failure", text: FAIL_REASON_LABELS[worker.failReason] };
    case "completed":
    case "cancelled":
      return worker.runMs > 0 ? { kind: "duration", ms: worker.runMs } : null;
  }
}
