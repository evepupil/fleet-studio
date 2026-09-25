import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { submitWorker } from "../../src/engine/submit.js";
import {
  baselineConfig,
  basePoolOf,
  createTestEngine,
  type TestEngine,
} from "./support/testEngine.js";
import { waitFor } from "./support/waitFor.js";

/** 假苦工默认不会自己结束（out/err 文件一直是空的），方便观察某一刻到底放行了几个。 */
async function submitInto(engine: TestEngine, projectDir: string, title: string, pool?: string) {
  return submitWorker(engine.ctx, {
    projectPath: projectDir,
    cwd: projectDir,
    prompt: title,
    title,
    ...(pool === undefined ? {} : { pool }),
  });
}

function countByStatus(engine: TestEngine, status: string): number {
  return engine.repos.runs.listActive().filter((run) => run.status === status).length;
}

/** 不仅要等状态变成 running，还要等 launcher 异步拿到进程号——两件事不是同一时刻发生的。 */
function runningWithPidCount(engine: TestEngine): number {
  return engine.repos.runs
    .listActive()
    .filter((run) => run.status === "running" && run.pid !== null).length;
}

describe("放行循环：容量占位与公平放行（模块设计 3.4）", () => {
  let engine: TestEngine;
  let projectA: string;
  let projectB: string;

  beforeEach(async () => {
    const baseline = baselineConfig();
    const config = {
      ...baseline,
      pools: [{ ...basePoolOf(baseline), id: "dsf", capacity: 2, perProjectCap: null }],
    };
    engine = await createTestEngine({ config });
    projectA = join(engine.home, "project-a");
    projectB = join(engine.home, "project-b");
    await mkdir(projectA, { recursive: true });
    await mkdir(projectB, { recursive: true });
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("容量上限生效：提交 5 个任务，最多同时放行 2 个，其余排队", async () => {
    for (let i = 0; i < 5; i++) {
      await submitInto(engine, projectA, `任务${i}`);
    }
    await waitFor(() => countByStatus(engine, "running") === 2);
    // 再等一小会儿确认不会有第 3 个被放行（容量是硬上限，不是暂时性的先后顺序问题）。
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(countByStatus(engine, "running")).toBe(2);
    expect(countByStatus(engine, "queued")).toBe(3);
  });

  it("公共排队按池配置顺序派发，并在同一事务后记录模型归属", async () => {
    const current = engine.config.current();
    const first = { ...basePoolOf(current), id: "first", label: "first", capacity: 1 };
    const second = { ...first, id: "second", label: "second" };
    engine.config.setConfig({ ...current, pools: [first, second] });

    const summaries: Awaited<ReturnType<typeof submitInto>>[] = [];
    for (let i = 0; i < 3; i++) {
      summaries.push(await submitInto(engine, projectA, `公共${i}`));
    }
    await waitFor(() => runningWithPidCount(engine) === 2);
    await waitFor(() => engine.repos.runs.get(`${summaries[2]?.id}.1`)?.status === "queued");

    expect(engine.repos.workers.get(summaries[0]?.id ?? "")?.poolId).toBe("first");
    expect(engine.repos.workers.get(summaries[1]?.id ?? "")?.poolId).toBe("second");
    expect(engine.repos.workers.get(summaries[2]?.id ?? "")?.poolId).toBeNull();
    expect(engine.repos.workers.get(summaries[0]?.id ?? "")).toMatchObject({
      model: "mcgrox/deepseek-v4.1-flash",
      channel: "mcgrox",
      modelName: "deepseek-v4.1-flash",
    });
  });

  it("停用池不放行公共或点名排队任务，也不把它判成 pool_removed", async () => {
    const current = engine.config.current();
    engine.config.setConfig({
      ...current,
      pools: current.pools.map((pool) => ({ ...pool, capacity: 0, enabled: true })),
    });
    const publicTask = await submitInto(engine, projectA, "公共排队");
    const namedTask = await submitInto(engine, projectA, "点名排队", "dsf");
    const disabled = engine.config.current();
    engine.config.setConfig({
      ...disabled,
      pools: disabled.pools.map((pool) => ({ ...pool, enabled: false })),
    });
    engine.ctx.requestDispatch();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(engine.repos.runs.get(`${publicTask.id}.1`)?.status).toBe("queued");
    expect(engine.repos.runs.get(`${namedTask.id}.1`)).toMatchObject({
      status: "queued",
      failReason: null,
    });
    expect(engine.repos.workers.get(publicTask.id)?.poolId).toBeNull();
    expect(engine.repos.workers.get(namedTask.id)?.poolId).toBe("dsf");
    expect(engine.host.spawnedProcesses).toHaveLength(0);
  });

  it("谁占得少谁先补：甲占满容量后，甲腾出一个空位时优先给乙排队中的任务", async () => {
    const aSummaries = [];
    for (let i = 0; i < 3; i++) {
      aSummaries.push(await submitInto(engine, projectA, `甲${i}`));
    }
    await waitFor(() => runningWithPidCount(engine) === 2);
    const bSummary = await submitInto(engine, projectB, "乙0");

    const aWorkerIds = new Set(aSummaries.map((summary) => summary.id));
    const aRunningRun = engine.repos.runs
      .listActive()
      .find((run) => run.status === "running" && aWorkerIds.has(run.workerId));
    const pid = aRunningRun?.pid ?? null;
    if (pid === null) {
      throw new Error("甲应该已经有一个在跑的运行、并且拿到了进程号");
    }

    // 结束甲的一个在跑任务，腾出一个空位：这时甲还有 1 个在跑，乙有 0 个，空位应该先给乙。
    engine.host.triggerExit(pid, { code: 1, signal: null });

    await waitFor(() => engine.repos.runs.get(`${bSummary.id}.1`)?.status === "running");
  });

  it("池被从配置里删除：排队中的运行失败为 pool_removed，说明带池编号", async () => {
    const zeroCapacity = engine.config.current();
    engine.config.setConfig({
      ...zeroCapacity,
      pools: [{ ...basePoolOf(zeroCapacity), capacity: 0 }], // 先把容量清零，保证任务卡在排队中
    });
    const summary = await submitInto(engine, projectA, "占坑", "dsf");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(engine.repos.runs.get(`${summary.id}.1`)?.status).toBe("queued");

    // 现在把整个池从配置里删掉，换一个新池顶替默认池的位置。
    const currentConfig = engine.config.current();
    engine.config.setConfig({
      ...currentConfig,
      defaults: { ...currentConfig.defaults, pool: "other" },
      pools: [{ ...basePoolOf(currentConfig), id: "other" }],
    });
    engine.ctx.requestDispatch();

    await waitFor(() => engine.repos.runs.get(`${summary.id}.1`)?.status === "failed");
    const run = engine.repos.runs.get(`${summary.id}.1`);
    expect(run?.failReason).toBe("pool_removed");
    expect(run?.errorMessage).toContain("dsf");
  });

  it("F2 回归：处理 A 的收尾期间 B 被取消收尾，池删除的清理不会覆盖成 pool_removed", async () => {
    const zeroCapacity = engine.config.current();
    engine.config.setConfig({
      ...zeroCapacity,
      pools: [{ ...basePoolOf(zeroCapacity), capacity: 0 }], // 保证两个任务都卡在排队中
    });
    const summaryA = await submitInto(engine, projectA, "甲占坑", "dsf");
    engine.advanceNow(10); // 保证 A 的 queuedAt 严格早于 B，放行循环处理顺序才是确定的
    const summaryB = await submitInto(engine, projectA, "乙占坑", "dsf");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(engine.repos.runs.get(`${summaryA.id}.1`)?.status).toBe("queued");
    expect(engine.repos.runs.get(`${summaryB.id}.1`)?.status).toBe("queued");

    // 把整个池删掉，换一个新池顶替默认池的位置。
    const currentConfig = engine.config.current();
    engine.config.setConfig({
      ...currentConfig,
      defaults: { ...currentConfig.defaults, pool: "other" },
      pools: [{ ...basePoolOf(currentConfig), id: "other" }],
    });

    // finishRun 收尾 A 时会调用 timelines.refresh；借它模拟评审描述的原始竞态：
    // 「处理 A 期间，B 被取消收尾了」。
    const originalRefresh = engine.ctx.timelines.refresh;
    let injected = false;
    engine.ctx.timelines.refresh = async (workerId: string): Promise<void> => {
      if (workerId === summaryA.id && !injected) {
        injected = true;
        engine.repos.runs.update(`${summaryB.id}.1`, {
          status: "cancelled",
          failReason: null,
          errorMessage: "已被取消",
          endedAt: "2026-01-01T00:30:00.000Z",
        });
      }
      return originalRefresh(workerId);
    };

    engine.ctx.requestDispatch();

    await waitFor(() => engine.repos.runs.get(`${summaryA.id}.1`)?.status === "failed");
    expect(engine.repos.runs.get(`${summaryA.id}.1`)?.failReason).toBe("pool_removed");
    // B 已经被取消收尾了，不能被同一轮 pool_removed 清理覆盖掉。
    const runB = engine.repos.runs.get(`${summaryB.id}.1`);
    expect(runB?.status).toBe("cancelled");
    expect(runB?.failReason).toBeNull();
  });
});
