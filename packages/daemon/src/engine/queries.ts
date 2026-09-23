import {
  applyPoolPatch,
  buildWorkerDetail,
  buildWorkerSummary,
  FleetError,
  type HealthInfo,
  type ListWorkersQuery,
  normalizeProjectPath,
  type PoolPatch,
  type PoolView,
  projectKeyOf,
  type RoleView,
  type RunRecord,
  type WorkerDetail,
  type WorkerSummary,
} from "@fleet/core";
import type { EngineContext } from "./types.js";

/** listWorkers：project 参数先归一化成项目键；按创建时间倒序取 limit 个，算摘要，再按 status 过滤。 */
export function listWorkers(ctx: EngineContext, query: ListWorkersQuery): WorkerSummary[] {
  const config = ctx.deps.config.current();
  const projectKey =
    query.project !== undefined
      ? projectKeyOf(normalizeProjectPath(query.project, ctx.deps.platform), ctx.deps.platform)
      : undefined;

  const workers = ctx.deps.repos.workers.listRecent(query.limit, projectKey);
  const runsByWorkerId = groupRunsByWorkerId(
    ctx.deps.repos.runs.listByWorkers(workers.map((w) => w.id)),
  );
  const positions = ctx.snapshots.queuePositions();

  const summaries = workers.map((worker) =>
    buildWorkerSummary(worker, runsByWorkerId.get(worker.id) ?? [], config, positions),
  );
  return query.status === undefined
    ? summaries
    : summaries.filter((s) => s.status === query.status);
}

/** getWorker：不存在返回 null；存在就拼完整详情。 */
export function getWorkerDetail(ctx: EngineContext, id: string): WorkerDetail | null {
  const worker = ctx.deps.repos.workers.get(id);
  if (worker === null) {
    return null;
  }
  const project = ctx.deps.repos.projects.get(worker.projectKey);
  if (project === null) {
    // projects 和 workers 之间有外键级联删除，苦工存在时所属项目理应一定存在；
    // 真的查不到说明数据库被外部改坏了，照 rowMappers.ts 的风格直接报内部错误，不悄悄编一份假数据。
    throw new FleetError("internal", `苦工 ${id} 的项目记录丢失：${worker.projectKey}`);
  }
  const runs = ctx.deps.repos.runs.listByWorker(id);
  const config = ctx.deps.config.current();
  return buildWorkerDetail(worker, runs, project, config, ctx.snapshots.queuePositions());
}

/** pools()：直接取快照里已经算好的池视图，跟看板看到的口径完全一致。 */
export function listPools(ctx: EngineContext): PoolView[] {
  return ctx.snapshots.get().pools;
}

/** roles()：同样直接借用快照里的角色视图。 */
export function listRoles(ctx: EngineContext): RoleView[] {
  return ctx.snapshots.get().roles;
}

/** patchPool：保存新配置后返回这个池的新视图；save() 之后不管配置存储会不会自己通知，这里都主动反应一遍。 */
export async function patchPool(
  ctx: EngineContext,
  id: string,
  patch: PoolPatch,
): Promise<PoolView> {
  const nextConfig = applyPoolPatch(ctx.deps.config.current(), id, patch);
  await ctx.deps.config.save(nextConfig);

  ctx.deps.host.invalidate();
  ctx.snapshots.markDirty();
  ctx.notifySnapshot();
  ctx.requestDispatch();

  const view = ctx.snapshots.get().pools.find((pool) => pool.id === id);
  if (view === undefined) {
    throw new FleetError("internal", `保存配置后找不到池：${id}`);
  }
  return view;
}

export function getHealth(ctx: EngineContext): HealthInfo {
  return {
    ok: true,
    version: ctx.deps.version,
    startedAt: ctx.deps.startedAt,
    pid: process.pid,
    home: ctx.deps.paths.home,
    port: ctx.deps.getPort(),
  };
}

function groupRunsByWorkerId(runs: readonly RunRecord[]): Map<string, RunRecord[]> {
  const grouped = new Map<string, RunRecord[]>();
  for (const run of runs) {
    const list = grouped.get(run.workerId);
    if (list) {
      list.push(run);
    } else {
      grouped.set(run.workerId, [run]);
    }
  }
  return grouped;
}
