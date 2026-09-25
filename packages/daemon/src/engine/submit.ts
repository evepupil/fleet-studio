import { stat } from "node:fs/promises";
import {
  buildWorkerSummary,
  createWorkerId,
  FleetError,
  findLatestRun,
  findPool,
  findRole,
  isTerminalStatus,
  normalizeProjectPath,
  oneLine,
  type ProjectRecord,
  pickColorIndex,
  piSessionIdOf,
  poolChannelModel,
  projectKeyOf,
  projectNameOf,
  type RunRecord,
  resolveQueueTimeoutMs,
  resolveRunTimeoutMs,
  runIdOf,
  type SendRequest,
  type SubmitRequest,
  type WorkerRecord,
  type WorkerSummary,
  ZERO_USAGE,
} from "@fleet/core";
import type { EngineContext } from "./types.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60_000;
const MAX_WORKER_ID_ATTEMPTS = 20;
const TITLE_MAX_CHARS = 40;

/** 派活 submit(request)：模块设计 3.2。校验配置、归一化路径，建档并请求放行。 */
export async function submitWorker(
  ctx: EngineContext,
  request: SubmitRequest,
): Promise<WorkerSummary> {
  const config = ctx.deps.config.current();
  const requestedPoolId = request.pool ?? null;
  const roleId = request.role ?? config.defaults.role;
  const runtime = request.runtime ?? config.defaults.runtime;

  const pool = requestedPoolId === null ? null : findPool(config, requestedPoolId);
  if (requestedPoolId !== null && pool === null) {
    throw new FleetError("invalid_request", `池不存在：${requestedPoolId}`);
  }
  if (pool !== null && !pool.enabled) {
    throw new FleetError("pool_disabled", `池 ${pool.id} 已停用，换一个池或不点名`);
  }
  if (findRole(config, roleId) === null) {
    throw new FleetError("invalid_request", `角色不存在：${roleId}`);
  }
  if (
    pool === null &&
    !config.pools.some((candidate) => poolChannelModel(candidate, runtime) !== null)
  ) {
    throw new FleetError("invalid_request", `没有配置 ${runtime} 模型的池`);
  }
  const poolModel = pool === null ? null : poolChannelModel(pool, runtime);
  if (pool !== null && poolModel === null) {
    throw new FleetError("invalid_request", `池 ${pool.id} 没有为 ${runtime} 指定模型`);
  }
  const timeoutMs =
    pool === null
      ? (request.timeoutMin ?? config.defaults.runTimeoutMin) * MS_PER_MINUTE
      : resolveRunTimeoutMs(config, pool, request.timeoutMin);
  const queueTimeoutMin =
    request.queueTimeoutMin === undefined
      ? config.defaults.queueTimeoutMin
      : request.queueTimeoutMin;
  const queueTimeoutMs =
    pool === null
      ? queueTimeoutMin === null
        ? null
        : queueTimeoutMin * MS_PER_MINUTE
      : resolveQueueTimeoutMs(config, pool, request.queueTimeoutMin);

  const projectPath = normalizeProjectPath(request.projectPath, ctx.deps.platform);
  const cwd = normalizeProjectPath(request.cwd, ctx.deps.platform);
  await assertDirectoryExists(cwd);

  const nowMs = ctx.now();
  const now = new Date(nowMs).toISOString();
  const projectKey = projectKeyOf(projectPath, ctx.deps.platform);
  const existingProject = ctx.deps.repos.projects.get(projectKey);
  const project: ProjectRecord = existingProject ?? {
    key: projectKey,
    path: projectPath,
    name: projectNameOf(projectPath),
    colorIndex: pickColorIndex(
      ctx.deps.repos.projects.colorIndicesInUse(new Date(nowMs - SEVEN_DAYS_MS).toISOString()),
      projectKey,
    ),
    createdAt: now,
  };

  const workerId = createUniqueWorkerId(ctx);
  const title = request.title ?? oneLine(firstNonEmptyLine(request.prompt), TITLE_MAX_CHARS);
  const runtimeSessionRef = runtime === "pi" ? piSessionIdOf(workerId) : null;

  const worker: WorkerRecord = {
    id: workerId,
    projectKey,
    cwd,
    title,
    role: roleId,
    runtime,
    requestedPool: requestedPoolId,
    poolId: requestedPoolId,
    model: poolModel?.display ?? null,
    channel: poolModel?.channel ?? null,
    modelName: poolModel?.modelName ?? null,
    thinking: request.thinking ?? config.defaults.thinking,
    sessionRef: runtimeSessionRef,
    createdAt: now,
    latestRunSeq: 1,
  };

  const run: RunRecord = {
    id: runIdOf(workerId, 1),
    workerId,
    seq: 1,
    prompt: request.prompt,
    status: "queued",
    failReason: null,
    errorMessage: null,
    queuedAt: now,
    startedAt: null,
    endedAt: null,
    timeoutMs,
    queueTimeoutMs,
    pid: null,
    processImage: null,
    spawnedAt: null,
    exitCode: null,
    killedBy: null,
    usage: ZERO_USAGE,
    runMs: null,
    retry: null,
    activity: null,
    lastActivityAt: null,
    finalText: null,
    eventCount: 0,
  };

  ctx.deps.repos.transaction(() => {
    if (existingProject === null) {
      ctx.deps.repos.projects.insert(project);
    }
    ctx.deps.repos.workers.insert(worker);
    ctx.deps.repos.runs.insert(run);
  });

  await ctx.timelines.refresh(workerId);
  ctx.notifyWorker(workerId);
  ctx.requestDispatch();

  return buildWorkerSummary(worker, [run], config, ctx.snapshots.queuePositions(), nowMs);
}

/** 续接 send(id, request)：模块设计 3.3。只能对已结束的苦工追加指令，复用同一个会话。 */
export async function sendToWorker(
  ctx: EngineContext,
  id: string,
  request: SendRequest,
): Promise<WorkerSummary> {
  const worker = ctx.deps.repos.workers.get(id);
  if (worker === null) {
    throw new FleetError("not_found", `苦工不存在：${id}`);
  }
  const runs = ctx.deps.repos.runs.listByWorker(id);
  const latest = findLatestRun(worker, runs);
  if (latest === null) {
    throw new FleetError("internal", "苦工没有任何运行记录");
  }
  if (!isTerminalStatus(latest.status)) {
    throw new FleetError("conflict", "苦工还在排队或工作中，等它结束后再追加指令");
  }
  const config = ctx.deps.config.current();
  const pool = worker.poolId === null ? null : findPool(config, worker.poolId);
  if (pool !== null && !pool.enabled) {
    throw new FleetError("pool_disabled", `原来的池 ${pool.id} 已停用，续接要沿用原池`);
  }
  if (worker.runtime === "opencode" && worker.sessionRef === null) {
    throw new FleetError("conflict", "会话还没建立，无法续接");
  }

  const now = new Date(ctx.now()).toISOString();
  const newSeq = worker.latestRunSeq + 1;

  // 池可能在苦工创建之后被从配置里删除；这种运行反正会在下一轮放行里被判 pool_removed，
  // 超时时长退化成「单次覆盖 ?? 全局默认」即可，不必为了这个边界情况伪造一个池对象。
  const timeoutMs =
    pool !== null
      ? resolveRunTimeoutMs(config, pool, request.timeoutMin)
      : (request.timeoutMin ?? config.defaults.runTimeoutMin) * MS_PER_MINUTE;
  const queueTimeoutMs =
    pool !== null
      ? resolveQueueTimeoutMs(config, pool, undefined)
      : config.defaults.queueTimeoutMin === null
        ? null
        : config.defaults.queueTimeoutMin * MS_PER_MINUTE;

  const run: RunRecord = {
    id: runIdOf(id, newSeq),
    workerId: id,
    seq: newSeq,
    prompt: request.prompt,
    status: "queued",
    failReason: null,
    errorMessage: null,
    queuedAt: now,
    startedAt: null,
    endedAt: null,
    timeoutMs,
    queueTimeoutMs,
    pid: null,
    processImage: null,
    spawnedAt: null,
    exitCode: null,
    killedBy: null,
    usage: ZERO_USAGE,
    runMs: null,
    retry: null,
    activity: null,
    lastActivityAt: null,
    finalText: null,
    eventCount: 0,
  };

  ctx.deps.repos.transaction(() => {
    ctx.deps.repos.runs.insert(run);
    ctx.deps.repos.workers.update(id, { latestRunSeq: newSeq });
  });

  await ctx.timelines.refresh(id);
  ctx.notifyWorker(id);
  ctx.requestDispatch();

  const updatedWorker: WorkerRecord = { ...worker, latestRunSeq: newSeq };
  return buildWorkerSummary(
    updatedWorker,
    [...runs, run],
    config,
    ctx.snapshots.queuePositions(),
    ctx.now(),
  );
}

async function assertDirectoryExists(cwd: string): Promise<void> {
  try {
    const info = await stat(cwd);
    if (!info.isDirectory()) {
      throw new FleetError("invalid_request", `工作目录不存在：${cwd}`);
    }
  } catch (error) {
    if (error instanceof FleetError) {
      throw error;
    }
    throw new FleetError("invalid_request", `工作目录不存在：${cwd}`);
  }
}

function createUniqueWorkerId(ctx: EngineContext): string {
  for (let attempt = 0; attempt < MAX_WORKER_ID_ATTEMPTS; attempt++) {
    const id = createWorkerId();
    if (!ctx.deps.repos.workers.exists(id)) {
      return id;
    }
  }
  throw new FleetError("internal", "生成苦工编号连续多次撞车，放弃");
}

/** 标题兜底：任务正文第一个非空行；找不到非空行（例如整段全是空白）就用原文本兜底。 */
function firstNonEmptyLine(text: string): string {
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (line.trim().length > 0) {
      return line;
    }
  }
  return text;
}
