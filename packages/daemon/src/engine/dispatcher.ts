import { FleetError, findPool, planDispatch, poolChannelModel, type RunRecord } from "@fleet/core";
import { finishRun } from "./finisher.js";
import { launchRun } from "./launcher.js";
import { buildSchedulingInputs } from "./schedulingInputs.js";
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
  const { limits, running, queued } = buildSchedulingInputs(
    config,
    active,
    workerById,
    ctx.deps.logger,
  );
  const toDispatch = planDispatch(limits, running, queued);
  const startedAt = new Date(ctx.now()).toISOString();

  for (const decision of toDispatch) {
    const run = ctx.deps.repos.runs.get(decision.runId);
    const worker = run === null ? null : ctx.deps.repos.workers.get(run.workerId);
    if (run === null || run.status !== "queued" || worker === null) {
      continue; // 防御：这一轮里状态已经被别的路径改变
    }

    const currentConfig = ctx.deps.config.current();
    const pool = findPool(currentConfig, decision.poolId);
    if (pool === null || !pool.enabled || (worker.poolId !== null && worker.poolId !== pool.id)) {
      continue;
    }

    const model = worker.poolId === null ? poolChannelModel(pool, worker.runtime) : null;
    if (worker.poolId === null && model === null) {
      ctx.deps.logger.error(
        `派活决策为运行 ${run.id} 选择了未配置 ${worker.runtime} 的池 ${pool.id}`,
        new FleetError("internal", "派活决策与池运行时配置不一致"),
      );
      continue;
    }

    // 未点名任务在确定实际池时与运行占位同事务写入，避免崩溃后留下半分配记录。
    ctx.deps.repos.transaction(() => {
      if (worker.poolId === null && model !== null) {
        ctx.deps.repos.workers.update(worker.id, {
          poolId: pool.id,
          model: model.display,
          channel: model.channel,
          modelName: model.modelName,
        });
      }
      ctx.deps.repos.runs.update(run.id, { status: "running", startedAt });
    });
    const updatedRun: RunRecord = { ...run, status: "running", startedAt };
    const launchWorker =
      worker.poolId === null && model !== null
        ? {
            ...worker,
            poolId: pool.id,
            model: model.display,
            channel: model.channel,
            modelName: model.modelName,
          }
        : worker;
    ctx.notifyWorker(worker.id);

    void launchRun(ctx, updatedRun, launchWorker).catch((error) => {
      ctx.deps.logger.error(`运行 ${decision.runId} 启动出错`, error);
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
    if (
      worker === undefined ||
      worker.poolId === null ||
      findPool(config, worker.poolId) !== null
    ) {
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
