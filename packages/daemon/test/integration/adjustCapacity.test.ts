/**
 * 规格第 5 节第 10 条：调整容量。容量 1 时派 3 个 hang，PATCH 把容量改为 3 后，3 个都要
 * 在跑（轮询等待，最多 5 秒），并且配置文件里的容量也要变成 3（不是只有内存里变了）。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { WorkerSummary } from "@fleet/core";
import { scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listWorkers, patchPool, submitWorker } from "./support/api.js";
import { TEST_POOL_ID } from "./support/config.js";
import { type Harness, startHarness } from "./support/harness.js";
import { waitFor } from "./support/poll.js";
import { waitForTraceStarts } from "./support/trace.js";

describe("调整容量：PATCH 后立即多放行（规格第 10 条）", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness({ capacity: 1 });
  });

  afterEach(async () => {
    await harness.stop();
  });

  it("容量 1 时派 3 个 hang，改容量为 3 后 3 个都在跑，配置文件里的容量也变成 3", async () => {
    for (let i = 0; i < 3; i += 1) {
      await submitWorker(harness, {
        projectPath: harness.projectDir,
        prompt: scenarioPrompt("hang"),
      });
    }
    await waitFor(async () => {
      const list = await listWorkers(harness, { project: harness.projectDir });
      return list.filter((w: WorkerSummary) => w.status === "running").length === 1;
    });

    const patchResult = await patchPool(harness, TEST_POOL_ID, { capacity: 3 });
    expect(patchResult.status).toBe(200);
    expect(patchResult.body.capacity).toBe(3);

    await waitFor(
      async () => {
        const list = await listWorkers(harness, { project: harness.projectDir });
        return list.filter((w: WorkerSummary) => w.status === "running").length === 3;
      },
      5000,
      100,
    );

    const configRaw = await readFile(join(harness.home, "config.json"), "utf8");
    const config = JSON.parse(configRaw);
    const pool = config.pools.find((candidate: { id: string }) => candidate.id === TEST_POOL_ID);
    expect(pool.capacity).toBe(3);

    // 「running」是放行循环占位时立刻写的，真正的进程要晚一步才拉起来（模块设计 3.4）；
    // 等轨迹文件追平 3 个进程都已经启动过，afterEach 才能按轨迹找全全部残留进程。
    await waitForTraceStarts(harness.traceFile, 3);
  }, 25000);
});
