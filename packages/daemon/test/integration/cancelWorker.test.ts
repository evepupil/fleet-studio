/**
 * 规格第 5 节第 7 条：取消。排队中的苦工取消后立即是已取消；工作中的苦工取消后是已
 * 取消，并且进程真的已经结束（不是只有数据库状态变了）。
 */
import { scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cancelWorker, getWorker, submitWorker } from "./support/api.js";
import { type Harness, startHarness } from "./support/harness.js";
import { waitFor } from "./support/poll.js";
import { requireDefined } from "./support/require.js";
import { waitForTraceStarts } from "./support/trace.js";
import { isPidAlive } from "./support/winProcess.js";

describe("取消：排队中立即取消，工作中取消后进程结束（规格第 7 条）", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness({ capacity: 1 });
  });

  afterEach(async () => {
    await harness.stop();
  });

  it("排队中的苦工取消后立即是已取消", async () => {
    const first = await submitWorker(harness, {
      projectPath: harness.projectDir,
      prompt: scenarioPrompt("hang"),
    });
    const firstId: string = first.id;
    await waitFor(async () => (await getWorker(harness, firstId)).summary.status === "running");

    // 容量 1 已经被 first 占满，second 必然排队。
    const second = await submitWorker(harness, {
      projectPath: harness.projectDir,
      prompt: scenarioPrompt("hang"),
    });
    const secondId: string = second.id;
    const beforeCancel = await getWorker(harness, secondId);
    expect(beforeCancel.summary.status).toBe("queued");

    const result = await cancelWorker(harness, secondId);
    expect(result.status).toBe(200);
    expect(result.body.worker.status).toBe("cancelled");

    // first 一直在跑，测试到这里就结束的话：「running」是放行循环占位时立刻写的，真正的
    // 进程要晚一步才拉起来（模块设计 3.4），afterEach 读轨迹文件找残留进程时可能还没写出
    // start 行、漏杀。等它真正起来再让测试收尾。
    await waitForTraceStarts(harness.traceFile, 1);
  }, 25000);

  it("工作中的苦工取消后是已取消，且进程已经结束", async () => {
    const worker = await submitWorker(harness, {
      projectPath: harness.projectDir,
      prompt: scenarioPrompt("hang"),
    });
    const workerId: string = worker.id;
    await waitFor(async () => (await getWorker(harness, workerId)).summary.status === "running");

    const trace = await waitForTraceStarts(harness.traceFile, 1);
    const started = requireDefined(
      trace.find((entry) => entry.event === "start"),
      "应该已经写出这个苦工的 start 轨迹",
    );
    const pid = started.pid;
    expect(await isPidAlive(pid)).toBe(true);

    const result = await cancelWorker(harness, workerId);
    expect(result.body.worker.status).toBe("cancelled");

    await waitFor(async () => !(await isPidAlive(pid)), 3000, 100);
    expect(await isPidAlive(pid)).toBe(false);
  }, 25000);
});
