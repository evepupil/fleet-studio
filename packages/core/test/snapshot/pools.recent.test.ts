import { describe, expect, it } from "vitest";
import { buildPoolViews } from "../../src/snapshot/pools.js";
import { baseConfig, makeRun, makeWorker } from "./fixtures.js";

const NOW = "2026-09-23T10:00:00.000Z";
const DAY_START = "2026-09-23T00:00:00.000Z";

/** 只取 fast 池的视图，方便断言（baseConfig 还带了一个 oc 池，本文件用例不关心它）。 */
function fastPoolView(
  workers: Parameters<typeof buildPoolViews>[1],
  runs: Parameters<typeof buildPoolViews>[2],
) {
  const config = baseConfig();
  const views = buildPoolViews(config.pools, workers, runs, config.roles, NOW, DAY_START);
  const fast = views.find((view) => view.id === "fast");
  if (!fast) {
    throw new Error("测试固件里缺 fast 池");
  }
  return fast;
}

describe("buildPoolViews：最近 24 小时战绩", () => {
  it("窗口是 (now − 24h, now]：恰好 24 小时前结束的不算，此刻结束的算", () => {
    const workers = [makeWorker({ id: "w1", poolId: "fast" })];
    const exactlyAtWindowStart = makeRun({
      id: "w1.1",
      workerId: "w1",
      status: "completed",
      startedAt: "2026-09-22T09:00:00.000Z",
      endedAt: "2026-09-22T10:00:00.000Z", // 恰好 now - 24h
      runMs: 1000,
    });
    const endedAtNow = makeRun({
      id: "w1.2",
      workerId: "w1",
      status: "completed",
      startedAt: "2026-09-23T09:00:00.000Z",
      endedAt: NOW,
      runMs: 3000,
    });

    const view = fastPoolView(workers, [exactlyAtWindowStart, endedAtNow]);

    expect(view.recent.windowHours).toBe(24);
    expect(view.recent.completed).toBe(1);
    expect(view.recent.avgRunMs).toBe(3000);
  });

  it("取消既不算完成也不算失败，失败单独计数", () => {
    const workers = [makeWorker({ id: "w1", poolId: "fast" })];
    const runs = [
      makeRun({
        id: "w1.1",
        workerId: "w1",
        status: "failed",
        failReason: "model_error",
        startedAt: "2026-09-23T09:00:00.000Z",
        endedAt: "2026-09-23T09:10:00.000Z",
        runMs: 600_000,
      }),
      makeRun({
        id: "w1.2",
        workerId: "w1",
        status: "cancelled",
        startedAt: "2026-09-23T09:20:00.000Z",
        endedAt: "2026-09-23T09:30:00.000Z",
        runMs: 600_000,
      }),
    ];

    const view = fastPoolView(workers, runs);

    expect(view.recent.failed).toBe(1);
    expect(view.recent.completed).toBe(0);
    // 取消的那次不进平均，只剩失败那次。
    expect(view.recent.avgRunMs).toBe(600_000);
  });

  it("avgRunMs 取已完成和失败的平均，runMs 缺失的用 endedAt − startedAt 补", () => {
    const workers = [makeWorker({ id: "w1", poolId: "fast" })];
    const runs = [
      makeRun({
        id: "w1.1",
        workerId: "w1",
        status: "completed",
        startedAt: "2026-09-23T09:00:00.000Z",
        endedAt: "2026-09-23T09:01:00.000Z",
        runMs: 60_000,
      }),
      makeRun({
        id: "w1.2",
        workerId: "w1",
        status: "failed",
        failReason: "timeout",
        startedAt: "2026-09-23T09:00:00.000Z",
        endedAt: "2026-09-23T09:02:00.000Z",
        runMs: null, // 用时间差补成 120000
      }),
    ];

    const view = fastPoolView(workers, runs);

    // (60000 + 120000) / 2 = 90000
    expect(view.recent.avgRunMs).toBe(90_000);
  });

  it("runMs 和起止时间都缺的那次不计入平均，但不影响计数", () => {
    const workers = [makeWorker({ id: "w1", poolId: "fast" })];
    const runs = [
      makeRun({
        id: "w1.1",
        workerId: "w1",
        status: "completed",
        startedAt: null,
        endedAt: "2026-09-23T09:00:00.000Z",
        runMs: null,
      }),
      makeRun({
        id: "w1.2",
        workerId: "w1",
        status: "completed",
        startedAt: "2026-09-23T09:00:00.000Z",
        endedAt: "2026-09-23T09:00:30.000Z",
        runMs: null,
      }),
    ];

    const view = fastPoolView(workers, runs);

    expect(view.recent.completed).toBe(2);
    expect(view.recent.avgRunMs).toBe(30_000);
  });

  it("窗口内没有结束的运行时 avgRunMs 为 null，计数为 0", () => {
    const workers = [makeWorker({ id: "w1", poolId: "fast" })];
    const stillRunning = makeRun({
      id: "w1.1",
      workerId: "w1",
      status: "running",
      startedAt: "2026-09-23T09:00:00.000Z",
      endedAt: null,
      runMs: null,
    });

    const view = fastPoolView(workers, [stillRunning]);

    expect(view.recent).toEqual({
      windowHours: 24,
      completed: 0,
      failed: 0,
      avgRunMs: null,
    });
  });

  it("只统计本池的运行：别的池结束的运行不算进这个池的 recent", () => {
    const workers = [
      makeWorker({ id: "w1", poolId: "fast" }),
      makeWorker({ id: "w2", poolId: "oc" }),
    ];
    const runs = [
      makeRun({
        id: "w1.1",
        workerId: "w1",
        status: "completed",
        startedAt: "2026-09-23T09:00:00.000Z",
        endedAt: "2026-09-23T09:01:00.000Z",
        runMs: 60_000,
      }),
      makeRun({
        id: "w2.1",
        workerId: "w2",
        status: "failed",
        failReason: "exit_code",
        startedAt: "2026-09-23T09:00:00.000Z",
        endedAt: "2026-09-23T09:05:00.000Z",
        runMs: 300_000,
      }),
    ];

    const view = fastPoolView(workers, runs);

    expect(view.recent.completed).toBe(1);
    expect(view.recent.failed).toBe(0);
    expect(view.recent.avgRunMs).toBe(60_000);
  });
});
