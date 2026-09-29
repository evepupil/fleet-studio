import type { TaskSortKey, TaskStatusFilter, TasksQuery } from "@fleet/core";
import type { RangeState } from "@/state/overviewStore";
import type { TaskFilterState } from "@/state/taskFilterStore";

/** 任务页有两种视图：看板（实时快照）和列表（历史查询） */
export type TaskView = "board" | "list";

export interface TaskFilterLookups {
  projects?: ReadonlyMap<string, string>;
  pools?: ReadonlyMap<string, string>;
  roles?: ReadonlyMap<string, string>;
  channels?: ReadonlyMap<string, string>;
  models?: ReadonlyMap<string, string>;
}

/** 筛选栏里的已选条件小标签。label 是最终显示的文字 */
export interface TaskFilterChip {
  key: "status" | "project" | "pool" | "role" | "channel" | "model";
  label: string;
}

/** 状态筛选的选项，按筛选菜单里的顺序；第一项「全部」是默认值 */
export const TASK_STATUS_OPTIONS: readonly { value: TaskStatusFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "active", label: "进行中" },
  { value: "queued", label: "排队中" },
  { value: "running", label: "工作中" },
  { value: "retrying", label: "重试中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "cancelled", label: "已取消" },
];

/** 列表的排序方式，按显示设置里的顺序；第一项「开始时间」是默认值 */
export const TASK_SORT_OPTIONS: readonly { value: TaskSortKey; label: string }[] = [
  { value: "createdAt", label: "开始时间" },
  { value: "tokens", label: "用量" },
  { value: "runMs", label: "耗时" },
];

export function taskStatusLabel(status: TaskStatusFilter): string {
  return TASK_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function taskSortLabel(sort: TaskSortKey): string {
  return TASK_SORT_OPTIONS.find((option) => option.value === sort)?.label ?? sort;
}

function rangeQuery(range: RangeState): Pick<TasksQuery, "range" | "from" | "to"> {
  return {
    range: range.kind,
    ...(range.from === undefined ? {} : { from: range.from }),
    ...(range.to === undefined ? {} : { to: range.to }),
  };
}

export function toTasksQuery(filters: TaskFilterState, cursor?: string): TasksQuery {
  return {
    ...rangeQuery(filters.range),
    status: filters.status,
    ...(filters.project === undefined ? {} : { project: filters.project }),
    ...(filters.pool === undefined ? {} : { pool: filters.pool }),
    ...(filters.role === undefined ? {} : { role: filters.role }),
    ...(filters.channel === undefined ? {} : { channel: filters.channel }),
    ...(filters.model === undefined ? {} : { model: filters.model }),
    ...(filters.q.trim().length === 0 ? {} : { q: filters.q.trim() }),
    sort: filters.sort,
    order: filters.order,
    ...(cursor === undefined ? {} : { cursor }),
    limit: 50,
  };
}

function displayName(
  id: string | undefined,
  names: ReadonlyMap<string, string> | undefined,
): string | undefined {
  return id === undefined ? undefined : (names?.get(id) ?? id);
}

/**
 * 筛选栏要显示的已选条件小标签，按 状态 → 项目 → 池 → 角色 → 渠道 → 模型 的顺序。
 * 状态只在列表视图、且不是默认的「全部」时出现；看板不认状态，所以不显示。
 * 时间范围和标题搜索有自己的控件显示当前值，不做成小标签。
 */
export function activeFilterChips(
  filters: TaskFilterState,
  lookups: TaskFilterLookups,
  view: TaskView,
): TaskFilterChip[] {
  const chips: TaskFilterChip[] = [];
  if (view === "list" && filters.status !== "all") {
    chips.push({ key: "status", label: `状态：${taskStatusLabel(filters.status)}` });
  }
  const project = displayName(filters.project, lookups.projects);
  if (project !== undefined) chips.push({ key: "project", label: `项目：${project}` });
  const pool = displayName(filters.pool, lookups.pools);
  if (pool !== undefined) chips.push({ key: "pool", label: `池：${pool}` });
  const role = displayName(filters.role, lookups.roles);
  if (role !== undefined) chips.push({ key: "role", label: `角色：${role}` });
  const channel = displayName(filters.channel, lookups.channels);
  if (channel !== undefined) chips.push({ key: "channel", label: `渠道：${channel}` });
  const model = displayName(filters.model, lookups.models);
  if (model !== undefined) chips.push({ key: "model", label: `模型：${model}` });
  return chips;
}

/** 去掉某个小标签时要写回仓库的改动 */
export function chipResetPatch(key: TaskFilterChip["key"]): Partial<TaskFilterState> {
  switch (key) {
    case "status":
      return { status: "all" };
    case "project":
      return { project: undefined };
    case "pool":
      return { pool: undefined };
    case "role":
      return { role: undefined };
    case "channel":
      return { channel: undefined };
    case "model":
      return { model: undefined };
  }
}

/**
 * 当前视图下是否有任何条件在起作用（决定「清除筛选」按钮出不出现、空结果用哪句话）。
 * 看板只看项目、池、角色、渠道、模型和标题；列表另外看状态和时间范围。排序不算筛选。
 */
export function hasActiveFilters(filters: TaskFilterState, view: TaskView): boolean {
  const shared =
    filters.project !== undefined ||
    filters.pool !== undefined ||
    filters.role !== undefined ||
    filters.channel !== undefined ||
    filters.model !== undefined ||
    filters.q.trim().length > 0;
  if (view === "board") return shared;
  return shared || filters.status !== "all" || filters.range.kind !== "all";
}
