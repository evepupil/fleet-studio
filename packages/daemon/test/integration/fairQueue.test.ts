/**
 * 规格第 5 节第 2 条：公平放行。甲项目先占满容量并排队，乙项目后到；容量释放时应该优先
 * 补给占用最少（乙，0 个在跑）的项目，而不是继续按甲的排队顺序往下放。
 */
import type { WorkerSummary } from "@fleet/core";
import { scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cancelWorker, getWorker, listWorkers, submitWorker } from "./support/api.js";
import { type Harness, startHarness } from "./support/harness.js";
import { waitFor } from "./support/poll.js";
import { requireDefined } from "./support/require.js";
import { createTempDir, removeTempDir } from "./support/tempDir.js";
import { waitForTraceStarts } from "./support/trace.js";

describe("公平放行：容量释放时优先补给占用最少的项目（规格第 2 条）", () => {
  let harness: Harness;
  let jiaDir: string;
  let yiDir: string;

  beforeEach(async () => {
    harness = await startHarness({ capacity: 3 });
    jiaDir = await createTempDir("fleet-jia-");
    yiDir = await createTempDir("fleet-yi-");
  }, 20000);

  // 全仓并行跑测试时 harness.stop() 要多花时间做假苦工进程的收尾（见 processCleanup.ts：
  // 先核对身份再结束、结束后再确认真的消失），这条用例还留着 4 个残留进程要收，
  // 比 vitest 默认的 10 秒钩子超时更容易超支，显式调宽。
  afterEach(async () => {
    await harness.stop();
    await removeTempDir(jiaDir);
    await removeTempDir(yiDir);
  }, 30000);

  // 这条用例要连续做好几轮轮询等待，开发机繁忙时单轮就可能超过默认预算；
  // 显式调宽测试自身的超时（项目全局 testTimeout 是 20 秒）。
  it("取消甲的一个在跑苦工后，下一个开跑的是乙的第一个，不是甲排队中的下一个", async () => {
    const jiaIds: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const worker = await submitWorker(harness, {
        projectPath: jiaDir,
        prompt: scenarioPrompt("hang"),
      });
      jiaIds.push(worker.id);
    }
    // 甲的 6 个到齐后，容量 3 应该已经稳定成 3 个在跑 + 3 个排队。
    await waitFor(async () => {
      const list = await listWorkers(harness, { project: jiaDir });
      return list.filter((w: WorkerSummary) => w.status === "running").length === 3;
    });

    const yiIds: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const worker = await submitWorker(harness, {
        projectPath: yiDir,
        prompt: scenarioPrompt("hang"),
      });
      yiIds.push(worker.id);
    }
    const yiFirst = requireDefined(yiIds[0], "乙应该提交了第一个苦工");
    const yiSecond = requireDefined(yiIds[1], "乙应该提交了第二个苦工");

    // 乙到达时甲已经占满容量：乙的两个都应该在排队，一个都不应该被放行。
    const yiFirstBefore = await getWorker(harness, yiFirst);
    const yiSecondBefore = await getWorker(harness, yiSecond);
    expect(yiFirstBefore.summary.status).toBe("queued");
    expect(yiSecondBefore.summary.status).toBe("queued");

    const jiaList = await listWorkers(harness, { project: jiaDir });
    const runningJia: WorkerSummary[] = jiaList.filter(
      (w: WorkerSummary) => w.status === "running",
    );
    const queuedJiaIds: string[] = jiaList
      .filter((w: WorkerSummary) => w.status === "queued")
      .map((w: WorkerSummary) => w.id);
    expect(runningJia).toHaveLength(3);
    expect(queuedJiaIds).toHaveLength(3);

    const toCancel = requireDefined(runningJia[0], "甲应该有 3 个在跑的苦工").id;
    const cancelResult = await cancelWorker(harness, toCancel);
    expect(cancelResult.body.worker.status).toBe("cancelled");

    // 空出的一个槛位应该给乙的第一个，不是甲排队中的下一个。
    await waitFor(async () => (await getWorker(harness, yiFirst)).summary.status === "running");

    const jiaListAfter = await listWorkers(harness, { project: jiaDir });
    for (const id of queuedJiaIds) {
      const worker = jiaListAfter.find((w: WorkerSummary) => w.id === id);
      expect(worker.status).toBe("queued");
    }
    const yiSecondAfter = await getWorker(harness, yiSecond);
    expect(yiSecondAfter.summary.status).toBe("queued");

    // 「running」是放行循环占位时立刻写的，真正的进程要晚一步才拉起来（模块设计 3.4）。
    // 乙的第一个刚变成 running 时进程未必已经起来；等轨迹文件追平（3 个原本在跑的甲 +
    // 1 个刚被放行的乙 = 4 个进程都已经启动过），afterEach 才能按轨迹找全所有残留进程。
    await waitForTraceStarts(harness.traceFile, 4);
  }, 35000);
});
