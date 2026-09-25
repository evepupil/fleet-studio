/** M5 dispatch integration: priority, shared queues, pool settings, continuation, and restart. */
import { API_PATHS, type Snapshot, type WorkerSummary } from "@fleet/core";
import { scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cancelWorker,
  getSnapshot,
  getWorker,
  reorderPools,
  sendMessage,
  setPoolEnabled,
  submitWorker,
} from "./support/api.js";
import { buildPriorityTestPools, PRIORITY_POOL_IDS } from "./support/config.js";
import { type Harness, startHarness } from "./support/harness.js";
import { readJsonBody } from "./support/http.js";
import { waitFor } from "./support/poll.js";
import { requireDefined } from "./support/require.js";
import { waitForTraceStarts } from "./support/trace.js";

const { alpha: ALPHA, beta: BETA } = PRIORITY_POOL_IDS;

async function snapshotOf(harness: Harness): Promise<Snapshot> {
  return (await getSnapshot(harness)) as Snapshot;
}

function snapshotWorker(snapshot: Snapshot, id: string): WorkerSummary {
  return requireDefined(
    snapshot.workers.find((worker) => worker.id === id),
    `快照应该包含苦工 ${id}`,
  );
}

async function waitForStatus(
  harness: Harness,
  id: string,
  status: WorkerSummary["status"],
  timeoutMs = 15000,
): Promise<void> {
  await waitFor(
    async () => (await getWorker(harness, id))?.summary.status === status,
    timeoutMs,
    100,
  );
}

describe("M5 多池集成调度", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness({ capacity: 1, pools: buildPriorityTestPools() });
  }, 20000);

  afterEach(async () => {
    await harness.stop();
  }, 30000);

  it("不点名任务按优先级分池，甲释放后公共排队任务进入甲", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const worker = await submitWorker(harness, {
        projectPath: harness.projectDir,
        prompt: scenarioPrompt("hang"),
        runtime: "pi",
      });
      ids.push(worker.id);
    }

    await waitFor(async () => {
      const snapshot = await snapshotOf(harness);
      const current = ids.map((id) => snapshotWorker(snapshot, id));
      return (
        snapshot.sharedQueued === 1 &&
        current.slice(0, 3).every((worker) => worker.status === "running") &&
        current[3]?.status === "queued" &&
        current[3]?.poolId === null
      );
    });
    const initial = await snapshotOf(harness);
    const workers = ids.map((id) => snapshotWorker(initial, id));
    expect(
      workers
        .slice(0, 3)
        .map((worker) => worker.poolId)
        .sort(),
    ).toEqual([ALPHA, BETA, BETA].sort());
    expect(workers.slice(0, 3).every((worker) => worker.status === "running")).toBe(true);
    expect(workers[3]?.status).toBe("queued");
    expect(workers[3]?.poolId).toBeNull();
    expect(initial.sharedQueued).toBe(1);

    const alphaWorker = requireDefined(
      workers.slice(0, 3).find((worker) => worker.poolId === ALPHA),
      "甲应该有一个在跑的苦工",
    );
    expect((await cancelWorker(harness, alphaWorker.id)).status).toBe(200);
    const queuedId = requireDefined(ids[3], "应该提交第四个苦工");
    await waitFor(async () => {
      const worker = await getWorker(harness, queuedId);
      return worker?.summary.status === "running" && worker.summary.poolId === ALPHA;
    });
    expect((await getWorker(harness, queuedId)).summary.poolId).toBe(ALPHA);
    await waitForTraceStarts(harness.traceFile, 4);
  }, 30000);

  it("点名乙且乙已满时留在乙排队，不占用空闲的甲", async () => {
    const betaIds: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const worker = await submitWorker(harness, {
        projectPath: harness.projectDir,
        prompt: scenarioPrompt("hang"),
        runtime: "pi",
        pool: BETA,
      });
      betaIds.push(worker.id);
    }
    for (const id of betaIds) {
      await waitForStatus(harness, id, "running");
    }

    const waiting = await submitWorker(harness, {
      projectPath: harness.projectDir,
      prompt: scenarioPrompt("hang"),
      runtime: "pi",
      pool: BETA,
    });
    await waitForStatus(harness, waiting.id, "queued");
    const detail = await getWorker(harness, waiting.id);
    expect(detail.summary.requestedPool).toBe(BETA);
    expect(detail.summary.poolId).toBe(BETA);

    const snapshot = await snapshotOf(harness);
    expect(snapshot.pools.find((pool) => pool.id === ALPHA)?.running).toBe(0);
    expect(snapshot.pools.find((pool) => pool.id === BETA)?.queued).toBe(1);
    await waitForTraceStarts(harness.traceFile, 2);
  }, 30000);

  it("停用甲不打断在跑任务，公共排队避开甲，点名报错，重启用后放行", async () => {
    const running = await submitWorker(harness, {
      projectPath: harness.projectDir,
      prompt: scenarioPrompt("success", { delayMs: 600, tools: 3 }),
      runtime: "pi",
    });
    await waitForStatus(harness, running.id, "running");
    await waitForTraceStarts(harness.traceFile, 1);

    expect((await setPoolEnabled(harness, ALPHA, false)).status).toBe(200);
    expect((await getWorker(harness, running.id)).summary.status).toBe("running");
    const betaIds: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const worker = await submitWorker(harness, {
        projectPath: harness.projectDir,
        prompt: scenarioPrompt("hang"),
        runtime: "pi",
        pool: BETA,
      });
      betaIds.push(worker.id);
    }
    for (const id of betaIds) {
      await waitForStatus(harness, id, "running");
    }
    await waitForTraceStarts(harness.traceFile, 3);

    const shared = await submitWorker(harness, {
      projectPath: harness.projectDir,
      prompt: scenarioPrompt("hang"),
      runtime: "pi",
    });
    await waitForStatus(harness, shared.id, "queued");
    expect((await getWorker(harness, shared.id)).summary.poolId).toBeNull();

    const disabledResponse = await harness.fetchWithToken(API_PATHS.workers, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectPath: harness.projectDir,
        cwd: harness.projectDir,
        prompt: scenarioPrompt("hang"),
        runtime: "pi",
        pool: ALPHA,
      }),
    });
    expect(disabledResponse.status).toBe(409);
    expect((await readJsonBody(disabledResponse)).error.code).toBe("pool_disabled");

    await waitForStatus(harness, running.id, "completed", 25000);
    const completed = await getWorker(harness, running.id);
    expect(completed.summary.status).toBe("completed");
    expect(completed.runs[0].exitCode).toBe(0);
    expect((await getWorker(harness, shared.id)).summary.poolId).toBeNull();

    expect((await setPoolEnabled(harness, ALPHA, true)).status).toBe(200);
    await waitFor(async () => {
      const worker = await getWorker(harness, shared.id);
      return worker?.summary.status === "running" && worker.summary.poolId === ALPHA;
    });
    await waitForTraceStarts(harness.traceFile, 4);
  }, 45000);

  it("乙上完成的任务续接后仍归乙，乙满时排在乙而不进甲", async () => {
    const original = await submitWorker(harness, {
      projectPath: harness.projectDir,
      prompt: scenarioPrompt("success", { delayMs: 30 }),
      runtime: "pi",
      pool: BETA,
    });
    await waitForStatus(harness, original.id, "completed");
    expect((await getWorker(harness, original.id)).summary.poolId).toBe(BETA);

    for (let index = 0; index < 2; index += 1) {
      await submitWorker(harness, {
        projectPath: harness.projectDir,
        prompt: scenarioPrompt("hang"),
        runtime: "pi",
        pool: BETA,
      });
    }
    await waitForTraceStarts(harness.traceFile, 3);

    expect((await sendMessage(harness, original.id, scenarioPrompt("hang"))).status).toBe(200);
    await waitFor(async () => {
      const worker = await getWorker(harness, original.id);
      return worker?.summary.runSeq === 2 && worker.summary.status === "queued";
    });
    const continued = await getWorker(harness, original.id);
    expect(continued.summary.poolId).toBe(BETA);
    const snapshot = await snapshotOf(harness);
    expect(snapshot.sharedQueued).toBe(0);
    expect(snapshot.pools.find((pool) => pool.id === ALPHA)?.running).toBe(0);
    expect(snapshot.pools.find((pool) => pool.id === BETA)?.queued).toBe(1);
  }, 35000);

  it("重排后新的不点名任务优先进入乙", async () => {
    const first = await submitWorker(harness, {
      projectPath: harness.projectDir,
      prompt: scenarioPrompt("hang"),
      runtime: "pi",
    });
    await waitForStatus(harness, first.id, "running");
    expect((await getWorker(harness, first.id)).summary.poolId).toBe(ALPHA);

    expect((await reorderPools(harness, [BETA, ALPHA])).status).toBe(200);
    const second = await submitWorker(harness, {
      projectPath: harness.projectDir,
      prompt: scenarioPrompt("hang"),
      runtime: "pi",
    });
    await waitForStatus(harness, second.id, "running");
    expect((await getWorker(harness, second.id)).summary.poolId).toBe(BETA);
    await waitForTraceStarts(harness.traceFile, 2);
  }, 30000);

  it("重启后公共排队仍不绑定池，释放甲的容量后正常放行", async () => {
    const runningIds: string[] = [];
    for (const pool of [ALPHA, BETA, BETA]) {
      const worker = await submitWorker(harness, {
        projectPath: harness.projectDir,
        prompt: scenarioPrompt("hang"),
        runtime: "pi",
        pool,
      });
      runningIds.push(worker.id);
    }
    for (const id of runningIds) {
      await waitForStatus(harness, id, "running");
    }

    const queued = await submitWorker(harness, {
      projectPath: harness.projectDir,
      prompt: scenarioPrompt("hang"),
      runtime: "pi",
    });
    await waitForStatus(harness, queued.id, "queued");
    expect((await getWorker(harness, queued.id)).summary.poolId).toBeNull();
    expect((await snapshotOf(harness)).sharedQueued).toBe(1);
    await waitForTraceStarts(harness.traceFile, 3);

    await harness.restart();
    await waitFor(async () => {
      const snapshot = await snapshotOf(harness);
      const worker = snapshotWorker(snapshot, queued.id);
      return snapshot.sharedQueued === 1 && worker.status === "queued" && worker.poolId === null;
    });

    const alphaRunningId = requireDefined(runningIds[0], "甲应该有一个在跑的苦工");
    expect((await cancelWorker(harness, alphaRunningId)).status).toBe(200);
    await waitFor(async () => {
      const worker = await getWorker(harness, queued.id);
      return worker?.summary.status === "running" && worker.summary.poolId === ALPHA;
    });
    await waitForTraceStarts(harness.traceFile, 4);
  }, 35000);
});
