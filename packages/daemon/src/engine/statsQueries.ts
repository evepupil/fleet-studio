import {
  computeStats,
  resolveRange,
  type StatsQuery,
  type StatsResponse,
  startOfLocalDay,
  type TimeZone,
} from "@fleet/core";
import { systemTimeZone } from "./timeZone.js";
import type { EngineContext } from "./types.js";

/** 统计查询只加载覆盖所选范围和本地今天所需的事实，再交给核心纯函数汇总。 */
export function queryStats(
  ctx: EngineContext,
  query: StatsQuery,
  tz: TimeZone = systemTimeZone,
): StatsResponse {
  const nowMs = ctx.now();
  const nowIso = new Date(nowMs).toISOString();
  const range = { kind: query.range, from: query.from, to: query.to };
  const resolved = resolveRange(range, nowMs, tz);
  const todayStartMs = startOfLocalDay(nowMs, tz);
  const sinceMs =
    query.range === "all"
      ? null
      : resolved.fromMs === null
        ? todayStartMs
        : Math.min(resolved.fromMs, todayStartMs);
  const since = sinceMs === null ? null : new Date(sinceMs).toISOString();

  const runs = ctx.deps.repos.stats.runFacts(since);
  const workerIds = [...new Set(runs.map((run) => run.workerId))];
  const workers = ctx.deps.repos.stats.workerFacts(since, workerIds);
  const projects = ctx.deps.repos.projects.list();
  const config = ctx.deps.config.current();
  const projectName = new Map(projects.map((project) => [project.key, project.name] as const));
  const projectColor = new Map(
    projects.map((project) => [project.key, project.colorIndex] as const),
  );
  const roleLabel = new Map(config.roles.map((role) => [role.id, role.label] as const));

  return computeStats({
    range,
    dimension: query.dimension,
    nowMs,
    tz,
    runs,
    workers,
    labels: {
      projectName,
      projectColor,
      roleLabel,
      seriesColor: (kind, name) => ctx.deps.repos.stats.seriesColor(kind, name, nowIso),
    },
  });
}
