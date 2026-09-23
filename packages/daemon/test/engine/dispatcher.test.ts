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
async function submitInto(engine: TestEngine, projectDir: string, title: string) {
  return submitWorker(engine.ctx, {
    projectPath: projectDir,
    cwd: projectDir,
    prompt: title,
    title,
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
    const summary = await submitInto(engine, projectA, "占坑");
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
});
