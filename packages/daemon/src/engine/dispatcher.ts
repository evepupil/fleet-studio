import {
  findPool,
  type PoolLimit,
  planDispatch,
  type QueuedEntry,
  type RunningEntry,
  type RunRecord,
} from "@fleet/core";
import { finishRun } from "./finisher.js";
import { launchRun } from "./launcher.js";
import type { EngineContext } from "./types.js";

export interface Dispatcher {
  /** 请求跑一轮放行；短时间内的多次请求会被合并成一轮。 */
  requestDispatch(): void;
}

/**
 * 放行循环（模块设计 3.4）：用 setImmediate 合并短时间内的多次请求，
 * 同一时刻只跑一轮；跑的时候又收到新请求，跑完之后再补跑一轮，不会丢请求。
 */
export function createDispatcher(ctx: EngineContext): Dispatcher {
  let scheduled = false;
  let running = false;
  let rerunNeeded = false;

  function requestDispatch(): void {
    if (running) {
      rerunNeeded = true;
      return;
    }
    if (scheduled) {
      return;
    }
    scheduled = true;
    setImmediate(() => {
      scheduled = false;
      void runGuarded();
    });
  }

  async function runGuarded(): Promise<void> {
    running = true;
    try {
      await runDispatchCycle(ctx);
    } catch (error) {
      ctx.deps.logger.error("放行循环出错", error);
    } finally {
      running = false;
      if (rerunNeeded) {
        rerunNeeded = false;
        requestDispatch();
      }
    }
  }

  return { requestDispatch };
}

/** 一轮放行：先把池已被删除的排队运行判失败，再按公平规则占位、交给启动器。 */
async function runDispatchCycle(ctx: EngineContext): Promise<void> {
  await failPoolRemovedRuns(ctx);

  const active = ctx.deps.repos.runs.listActive();
  const workerById = new Map(
    ctx.deps.repos.workers
      .listByIds([...new Set(active.map((run) => run.workerId))])
      .map((worker) => [worker.id, worker] as const),
  );
  const config = ctx.deps.config.current();
  const limits: PoolLimit[] = config.pools.map((pool) => ({
    poolId: pool.id,
    capacity: pool.capacity,
    perProjectCap: pool.perProjectCap,
  }));

  const running: RunningEntry[] = [];
  const queued: QueuedEntry[] = [];
  for (const run of active) {
    const worker = workerById.get(run.workerId);
    if (worker === undefined) {
      continue; // 数据不一致：运行找不到所属苦工，防御性跳过
    }
    if (run.status === "running") {
      running.push({ runId: run.id, poolId: worker.poolId, projectKey: worker.projectKey });
    } else {
      queued.push({
        runId: run.id,
        poolId: worker.poolId,
        projectKey: worker.projectKey,
        queuedAt: run.queuedAt,
      });
    }
  }

  const toDispatch = planDispatch(limits, running, queued);
  const startedAt = new Date(ctx.now()).toISOString();

  for (const runId of toDispatch) {
    const run = ctx.deps.repos.runs.get(runId);
    const worker = run !== null ? workerById.get(run.workerId) : undefined;
    if (run === null || run.status !== "queued" || worker === undefined) {
      continue; // 防御：这一轮里状态已经被别的路径改变
    }

    // 先占住槽位再交给启动器：防止下一轮（甚至同一轮的重入）重复放行同一个运行。
    ctx.deps.repos.runs.update(run.id, { status: "running", startedAt });
    const updatedRun: RunRecord = { ...run, status: "running", startedAt };
    ctx.notifyWorker(worker.id);

    void launchRun(ctx, updatedRun, worker).catch((error) => {
      ctx.deps.logger.error(`运行 ${runId} 启动出错`, error);
    });
  }
}

/** 排队中、但苦工所在的池已经不在配置里的运行：直接判失败，不参与放行。 */
async function failPoolRemovedRuns(ctx: EngineContext): Promise<void> {
  const queuedRuns = ctx.deps.repos.runs.listActive().filter((run) => run.status === "queued");
  if (queuedRuns.length === 0) {
    return;
  }
  const workerById = new Map(
    ctx.deps.repos.workers
      .listByIds([...new Set(queuedRuns.map((run) => run.workerId))])
      .map((worker) => [worker.id, worker] as const),
  );
  const config = ctx.deps.config.current();

  for (const run of queuedRuns) {
    const worker = workerById.get(run.workerId);
    if (worker === undefined || findPool(config, worker.poolId) !== null) {
      continue;
    }
    try {
      // 评审 F2：这里的 run 来自本函数开头取的排队快照，处理前一个运行时如果
      // await 了一段时间，这个运行可能已经被放行、甚至被取消收尾过——finishRun
      // 会重读库并核对 expectedStatus="queued"，不再是排队中就放弃，不会覆盖已经写好的终态。
      await finishRun(ctx, {
        run,
        worker,
        outcome: {
          status: "failed",
          failReason: "pool_removed",
          message: `所在的池 ${worker.poolId} 已从配置中删除`,
        },
        exitCode: run.exitCode,
        usage: run.usage,
        activity: run.activity,
        finalText: run.finalText,
        eventCount: run.eventCount,
        expectedStatus: "queued",
      });
    } catch (error) {
      ctx.deps.logger.error(`运行 ${run.id} 判定 pool_removed 收尾出错`, error);
    }
  }
}
