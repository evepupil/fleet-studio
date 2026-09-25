import { describe, expect, it } from "vitest";
import { buildSnapshot } from "../../src/snapshot/buildSnapshot.js";
import { baseConfig, makeProject, makeRun, makeWorker } from "./fixtures.js";

const NOW = "2026-09-23T10:00:00.000Z";
const DAY_START = "2026-09-23T00:00:00.000Z";

describe("buildSnapshot 实时卡片与公共排队", () => {
  it("live 的五个数：在跑 / 排队 / 重试按苦工算，格子数按池算", () => {
    const config = baseConfig();
    const workers = [
      makeWorker({ id: "wr1", poolId: "fast", latestRunSeq: 1 }),
      makeWorker({ id: "wr2", poolId: "fast", latestRunSeq: 1 }),
      makeWorker({ id: "wrt", poolId: "oc", latestRunSeq: 1 }),
      makeWorker({ id: "wq1", poolId: "fast", latestRunSeq: 1 }),
      // 没点名、还没被放行：公共排队，poolId 为 null。
      makeWorker({ id: "wq2", requestedPool: null, poolId: null, model: null, latestRunSeq: 1 }),
    ];
    const runs = [
      makeRun({
        id: "wr1.1",
        workerId: "wr1",
        seq: 1,
        status: "running",
        startedAt: "2026-09-23T09:00:00.000Z",
      }),
      makeRun({
        id: "wr2.1",
        workerId: "wr2",
        seq: 1,
        status: "running",
        startedAt: "2026-09-23T09:05:00.000Z",
      }),
      makeRun({
        id: "wrt.1",
        workerId: "wrt",
        seq: 1,
        status: "running",
        startedAt: "2026-09-23T09:10:00.000Z",
        retry: { attempt: 1, max: 3, message: "限流" },
      }),
      makeRun({
        id: "wq1.1",
        workerId: "wq1",
        seq: 1,
        status: "queued",
        startedAt: null,
        queuedAt: "2026-09-23T09:20:00.000Z",
      }),
      makeRun({
        id: "wq2.1",
        workerId: "wq2",
        seq: 1,
        status: "queued",
        startedAt: null,
        queuedAt: "2026-09-23T09:25:00.000Z",
      }),
    ];

    const snapshot = buildSnapshot({
      version: "test",
      now: NOW,
      dayStart: DAY_START,
      config,
      configError: null,
      projects: [],
      workers,
      runs,
      queuePositions: new Map([
        ["wq1.1", 1],
        ["wq2.1", 1],
      ]),
    });

    // fast 容量 4 + oc 容量 2，两个池都启用。
    expect(snapshot.live.slotsTotal).toBe(6);
    expect(snapshot.live.slotsUsed).toBe(3);
    expect(snapshot.live.running).toBe(3);
    expect(snapshot.live.queued).toBe(2);
    expect(snapshot.live.retrying).toBe(1);
  });

  it("停用池不计入 slotsTotal，但它里面还没跑完的运行仍计入 slotsUsed", () => {
    const config = baseConfig({
      pools: [
        {
          id: "fast",
          label: "快速池",
          capacity: 4,
          enabled: false,
          runtimes: { pi: { provider: "mcgrox", model: "deepseek-v4.1-flash" } },
        },
        {
          id: "oc",
          label: "OC 池",
          capacity: 2,
          runtimes: { opencode: { model: "gpt-5-mini" } },
        },
      ],
    });
    const worker = makeWorker({ id: "w1", poolId: "fast", latestRunSeq: 1 });
    const run = makeRun({
      id: "w1.1",
      workerId: "w1",
      seq: 1,
      status: "running",
      startedAt: "2026-09-23T09:00:00.000Z",
    });

    const snapshot = buildSnapshot({
      version: "test",
      now: NOW,
      dayStart: DAY_START,
      config,
      configError: null,
      projects: [],
      workers: [worker],
      runs: [run],
      queuePositions: new Map(),
    });

    expect(snapshot.live.slotsTotal).toBe(2); // 只剩 oc 的容量
    expect(snapshot.live.slotsUsed).toBe(1); // 停用池里的在跑照数
  });

  it("没点名的排队苦工：不进任何池的 queued，sharedQueued 为 1，摘要字段为 null，位置取自传入的 Map", () => {
    const config = baseConfig();
    const project = makeProject({ key: "c:/code/demo" });
    const worker = makeWorker({
      id: "wq",
      projectKey: "c:/code/demo",
      requestedPool: null,
      poolId: null,
      model: null,
      channel: null,
      modelName: null,
      latestRunSeq: 1,
    });
    const run = makeRun({
      id: "wq.1",
      workerId: "wq",
      seq: 1,
      status: "queued",
      startedAt: null,
      queuedAt: "2026-09-23T09:25:00.000Z",
    });

    const snapshot = buildSnapshot({
      version: "test",
      now: NOW,
      dayStart: DAY_START,
      config,
      configError: null,
      projects: [project],
      workers: [worker],
      runs: [run],
      queuePositions: new Map([["wq.1", 2]]),
    });

    expect(snapshot.sharedQueued).toBe(1);
    expect(snapshot.pools.every((pool) => pool.queued === 0)).toBe(true);
    expect(snapshot.pools.every((pool) => pool.queuedByProject.length === 0)).toBe(true);

    const summary = snapshot.workers[0];
    expect(summary).toMatchObject({
      requestedPool: null,
      poolId: null,
      model: null,
      channel: null,
      modelName: null,
      status: "queued",
      queuePosition: 2,
    });
  });

  it("点名的排队算进对应池，不算进 sharedQueued", () => {
    const config = baseConfig();
    const worker = makeWorker({ id: "wq", poolId: "fast", latestRunSeq: 1 });
    const run = makeRun({
      id: "wq.1",
      workerId: "wq",
      seq: 1,
      status: "queued",
      startedAt: null,
      queuedAt: "2026-09-23T09:25:00.000Z",
    });

    const snapshot = buildSnapshot({
      version: "test",
      now: NOW,
      dayStart: DAY_START,
      config,
      configError: null,
      projects: [],
      workers: [worker],
      runs: [run],
      queuePositions: new Map(),
    });

    expect(snapshot.sharedQueued).toBe(0);
    expect(snapshot.pools.find((pool) => pool.id === "fast")?.queued).toBe(1);
  });
});
