import {
  buildWorkerSummary,
  type ProjectInfo,
  type RangeRequest,
  type RunRecord,
  resolveRange,
  type TaskPage,
  type TasksQuery,
  type TimeZone,
} from "@fleet/core";
import type { TaskQueryInput } from "../store/types.js";
import { systemTimeZone } from "./timeZone.js";
import type { EngineContext } from "./types.js";

/** 按创建时间过滤任务，并为这一页批量装配运行记录和摘要。 */
export function queryTasks(
  ctx: EngineContext,
  query: TasksQuery,
  tz: TimeZone = systemTimeZone,
): TaskPage {
  const nowMs = ctx.now();
  const rangeRequest: RangeRequest = {
    kind: query.range,
    from: query.from,
    to: query.to,
  };
  const range = resolveRange(rangeRequest, nowMs, tz);
  const input: TaskQueryInput = {
    status: query.status,
    createdFrom: range.fromMs === null ? null : new Date(range.fromMs).toISOString(),
    createdTo: new Date(range.toMs).toISOString(),
    sort: query.sort,
    order: query.order,
    limit: query.limit,
    ...(query.project === undefined ? {} : { projectKey: query.project }),
    ...(query.pool === undefined ? {} : { poolId: query.pool }),
    ...(query.role === undefined ? {} : { role: query.role }),
    ...(query.channel === undefined ? {} : { channel: query.channel }),
    ...(query.model === undefined ? {} : { modelName: query.model }),
    ...(query.q === undefined ? {} : { titleContains: query.q }),
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
  };
  const result = ctx.deps.repos.tasks.query(input);
  let nextCursor = result.nextCursor;
  if (nextCursor !== null) {
    const nextPage = ctx.deps.repos.tasks.query({ ...input, cursor: nextCursor, limit: 1 });
    if (nextPage.workers.length === 0) {
      nextCursor = null;
    }
  }
  const runsByWorkerId = groupRuns(
    ctx.deps.repos.runs.listByWorkers(result.workers.map((worker) => worker.id)),
  );
  const config = ctx.deps.config.current();
  const positions = ctx.snapshots.queuePositions();
  const items = result.workers.map((worker) =>
    buildWorkerSummary(worker, runsByWorkerId.get(worker.id) ?? [], config, positions, nowMs),
  );

  return { items, nextCursor, total: result.total };
}

export function listProjects(ctx: EngineContext): ProjectInfo[] {
  return ctx.deps.repos.projects
    .list()
    .map(({ key, path, name, colorIndex }) => ({ key, path, name, colorIndex }))
    .sort((a, b) => {
      const left = a.name.toLowerCase();
      const right = b.name.toLowerCase();
      if (left !== right) {
        return left < right ? -1 : 1;
      }
      return a.key < b.key ? -1 : a.key === b.key ? 0 : 1;
    });
}

function groupRuns(runs: readonly RunRecord[]): Map<string, RunRecord[]> {
  const grouped = new Map<string, RunRecord[]>();
  for (const run of runs) {
    const workerRuns = grouped.get(run.workerId);
    if (workerRuns === undefined) {
      grouped.set(run.workerId, [run]);
    } else {
      workerRuns.push(run);
    }
  }
  return grouped;
}
