import type { TaskSortKey, TaskStatusFilter, TasksQuery } from "@fleet/core";
import type { RangeState } from "@/state/overviewStore";
import type { TaskFilterState } from "@/state/taskFilterStore";
import { formatRangeLabel } from "./format";

export interface TaskFilterLookups {
  projects?: ReadonlyMap<string, string>;
  pools?: ReadonlyMap<string, string>;
  roles?: ReadonlyMap<string, string>;
  channels?: ReadonlyMap<string, string>;
  models?: ReadonlyMap<string, string>;
  nowMs?: number;
}

export interface TaskFilterChip {
  key: "status" | "project" | "pool" | "role" | "channel" | "model" | "range" | "query" | "sort";
  label: string;
}

const STATUS_LABELS: Readonly<Record<TaskStatusFilter, string>> = {
  active: "进行中",
  queued: "排队中",
  running: "运行中",
  retrying: "自动重试",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
  all: "全部状态",
};

const SORT_LABELS: Readonly<Record<TaskSortKey, string>> = {
  createdAt: "开始时间",
  runMs: "运行时长",
  tokens: "Token",
};

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

export function activeFilterChips(
  filters: TaskFilterState,
  lookups: TaskFilterLookups = {},
): TaskFilterChip[] {
  const chips: TaskFilterChip[] = [];
  if (filters.status !== "active") {
    chips.push({ key: "status", label: STATUS_LABELS[filters.status] });
  }
  const project = displayName(filters.project, lookups.projects);
  if (project !== undefined) {
    chips.push({ key: "project", label: project });
  }
  const pool = displayName(filters.pool, lookups.pools);
  if (pool !== undefined) {
    chips.push({ key: "pool", label: pool });
  }
  const role = displayName(filters.role, lookups.roles);
  if (role !== undefined) {
    chips.push({ key: "role", label: role });
  }
  const channel = displayName(filters.channel, lookups.channels);
  if (channel !== undefined) {
    chips.push({ key: "channel", label: `渠道：${channel}` });
  }
  const model = displayName(filters.model, lookups.models);
  if (model !== undefined) {
    chips.push({ key: "model", label: `模型：${model}` });
  }
  if (filters.range.kind !== "all") {
    chips.push({
      key: "range",
      label: formatRangeLabel(filters.range, lookups.nowMs ?? 0),
    });
  }
  if (filters.q.trim().length > 0) {
    chips.push({ key: "query", label: filters.q.trim() });
  }
  if (filters.sort !== "createdAt" || filters.order !== "desc") {
    chips.push({
      key: "sort",
      label: `${SORT_LABELS[filters.sort]}${filters.order === "asc" ? "升序" : "降序"}`,
    });
  }
  return chips;
}
