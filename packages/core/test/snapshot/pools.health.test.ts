import { describe, expect, it } from "vitest";
import { ZERO_USAGE } from "../../src/domain/usage.js";
import { buildPoolViews } from "../../src/snapshot/pools.js";
import { baseConfig, makeRun, makeUsage, makeWorker } from "./fixtures.js";

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

describe("buildPoolViews：健康窗口 / 今日用量", () => {
  it("健康窗口：恰好 10 分钟前结束的不算，窗口内、此刻结束的算", () => {
    const workers = [makeWorker({ id: "w1", poolId: "fast" })];
    const exactlyAtWindowStart = makeRun({
      id: "w1.1",
      workerId: "w1",
      status: "completed",
      startedAt: "2026-09-23T09:00:00.000Z",
      endedAt: "2026-09-23T09:50:00.000Z", // 恰好 now - 10min
    });

    const win1 = fastPoolView(workers, [exactlyAtWindowStart]);
    expect(win1.health.completed).toBe(0);

    const justInsideWindow = makeRun({
      id: "w1.2",
      workerId: "w1",
      status: "completed",
      startedAt: "2026-09-23T09:00:00.000Z",
      endedAt: "2026-09-23T09:50:00.001Z",
    });
    const win2 = fastPoolView(workers, [justInsideWindow]);
    expect(win2.health.completed).toBe(1);

    const endedAtNow = makeRun({
      id: "w1.3",
      workerId: "w1",
      status: "completed",
      startedAt: "2026-09-23T09:00:00.000Z",
      endedAt: NOW,
    });
    const win3 = fastPoolView(workers, [endedAtNow]);
    expect(win3.health.completed).toBe(1);
  });

  it("健康窗口只统计已完成和失败，取消不算失败也不算完成", () => {
    const workers = [makeWorker({ id: "w1", poolId: "fast" })];
    const runs = [
      makeRun({
        id: "w1.1",
        workerId: "w1",
        status: "failed",
        failReason: "model_error",
        startedAt: "2026-09-23T09:00:00.000Z",
        endedAt: "2026-09-23T09:55:00.000Z",
      }),
      makeRun({
        id: "w1.2",
        workerId: "w1",
        status: "cancelled",
        startedAt: "2026-09-23T09:00:00.000Z",
        endedAt: "2026-09-23T09:55:00.000Z",
      }),
    ];

    const fast = fastPoolView(workers, runs);

    expect(fast.health.failed).toBe(1);
    expect(fast.health.completed).toBe(0);
    expect(fast.health.windowMinutes).toBe(10);
  });

  it("retrying 数在健康信息里统计工作中且带 retry 信息的运行", () => {
    const workers = [
      makeWorker({ id: "w1", poolId: "fast" }),
      makeWorker({ id: "w2", poolId: "fast" }),
    ];
    const runs = [
      makeRun({
        id: "w1.1",
        workerId: "w1",
        status: "running",
        retry: { attempt: 1, max: 3, message: "限流" },
      }),
      makeRun({ id: "w2.1", workerId: "w2", status: "running", retry: null }),
    ];

    expect(fastPoolView(workers, runs).health.retrying).toBe(1);
  });

  it("今日用量只统计本池内 startedAt 落在今天零点之后（含）的运行", () => {
    const workers = [makeWorker({ id: "w1", poolId: "fast" })];
    const runs = [
      makeRun({
        id: "w1.1",
        workerId: "w1",
        status: "completed",
        startedAt: "2026-09-23T01:00:00.000Z", // 今天
        endedAt: "2026-09-23T01:30:00.000Z",
        usage: makeUsage({ totalTokens: 100 }),
      }),
      makeRun({
        id: "w1.2",
        workerId: "w1",
        status: "completed",
        startedAt: "2026-09-22T23:00:00.000Z", // 昨天，不计入
        endedAt: "2026-09-22T23:30:00.000Z",
        usage: makeUsage({ totalTokens: 999 }),
      }),
      makeRun({
        id: "w1.3",
        workerId: "w1",
        status: "queued",
        startedAt: null, // 还没开始，不计入
        usage: makeUsage({ totalTokens: 999 }),
      }),
    ];

    expect(fastPoolView(workers, runs).usageToday).toEqual(makeUsage({ totalTokens: 100 }));
  });

  it("没有任何苦工或运行时，池视图仍然给出零值而不是缺字段", () => {
    const fast = fastPoolView([], []);

    expect(fast.running).toBe(0);
    expect(fast.queued).toBe(0);
    expect(fast.slots).toEqual([]);
    expect(fast.queuedByProject).toEqual([]);
    expect(fast.health).toEqual({ windowMinutes: 10, completed: 0, failed: 0, retrying: 0 });
    expect(fast.usageToday).toEqual({ ...ZERO_USAGE });
  });
});
