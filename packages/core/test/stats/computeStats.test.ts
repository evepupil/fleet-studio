import { describe, expect, it } from "vitest";
import { computeStats } from "../../src/stats/index.js";
import {
  MAIN_BUCKETS,
  mainInput,
  mainRuns,
  mainWorkers,
  NOW,
  TODAY_START,
  templateRun,
  templateWorker,
  WEEK_START,
} from "./fixtures.js";

/** 7d 范围内 12 次运行的合计 */
const EXPECTED_TOTAL_USAGE = {
  inputTokens: 5575,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 5575,
  costUsd: 5.5,
};

describe("computeStats：范围与分段", () => {
  it("7d：范围起点对齐到第一个分段起点，终点是 nowMs", () => {
    const stats = computeStats(mainInput());
    expect(stats.range).toEqual({
      kind: "7d",
      from: "2026-09-18T16:00:00.000Z",
      to: new Date(NOW).toISOString(),
    });
    expect(stats.granularity).toBe("day");
    expect(stats.buckets).toEqual(MAIN_BUCKETS.map((ms) => new Date(ms).toISOString()));
    expect(stats.dimension).toBe("model");
  });

  it("today：一天 24 段，起点是今天本地零点", () => {
    const stats = computeStats(mainInput({ range: { kind: "today" } }));
    expect(stats.granularity).toBe("hour");
    expect(stats.buckets).toHaveLength(15); // 本地 00:00 到 14:30，含 00:00 那一小时
    expect(stats.range.from).toBe(new Date(TODAY_START).toISOString());
    expect(stats.buckets[0]).toBe(new Date(TODAY_START).toISOString());
    expect(stats.buckets[14]).toBe("2026-09-25T06:00:00.000Z");
  });

  it("custom：终点取次日零点与 nowMs 中较早的那个", () => {
    const stats = computeStats(
      mainInput({ range: { kind: "custom", from: "2026-09-22", to: "2026-09-24" } }),
    );
    expect(stats.range.from).toBe("2026-09-21T16:00:00.000Z");
    expect(stats.range.to).toBe("2026-09-24T16:00:00.000Z");
    expect(stats.buckets).toEqual([
      "2026-09-21T16:00:00.000Z",
      "2026-09-22T16:00:00.000Z",
      "2026-09-23T16:00:00.000Z",
    ]);
  });

  it("custom：正好 2 天跨度时按小时分段", () => {
    const stats = computeStats(
      mainInput({ range: { kind: "custom", from: "2026-09-22", to: "2026-09-23" } }),
    );
    expect(stats.granularity).toBe("hour");
    expect(stats.buckets).toHaveLength(48);
  });

  it("all：起点取所有事实里最早的那个，并对齐到分段起点", () => {
    const stats = computeStats(mainInput({ range: { kind: "all" } }));
    // 最早的事实是任务 w1 的 createdAt（2026-09-19T02:00Z），本地 09-19 那天
    expect(stats.range.from).toBe("2026-09-18T16:00:00.000Z");
    expect(stats.granularity).toBe("day");
    expect(stats.buckets).toHaveLength(7);
  });

  it("all 且没有任何数据：起点为 null、没有分段", () => {
    const stats = computeStats(mainInput({ range: { kind: "all" }, runs: [], workers: [] }));
    expect(stats.range.from).toBeNull();
    expect(stats.range.to).toBe(new Date(NOW).toISOString());
    expect(stats.buckets).toEqual([]);
    expect(stats.granularity).toBe("hour");
    expect(stats.tokenShare).toEqual([]);
    expect(stats.tasksByProject).toEqual([]);
    expect(stats.tokenTrend).toEqual([]);
    expect(stats.total).toEqual({
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 0,
        costUsd: null,
      },
      tasks: 0,
      runMs: 0,
      avgRunMs: null,
    });
  });
});

describe("computeStats：一组统计数", () => {
  it("total：用量逐项相加、任务数、总耗时、平均耗时", () => {
    const { total } = computeStats(mainInput());
    expect(total.usage).toEqual(EXPECTED_TOTAL_USAGE);
    expect(total.tasks).toBe(13); // 7d 内创建的任务：w1～w13
    expect(total.runMs).toBe(16_252_500);
    // 分母是 7d 内至少跑过一次的任务（w1～w11 共 11 个），不含一次都没跑的 w12、w13
    expect(total.avgRunMs).toBe(1_477_500);
  });

  it("today：不受所选范围影响，用今天本地零点到现在", () => {
    const { today } = computeStats(mainInput({ range: { kind: "all" } }));
    expect(today.usage).toEqual({
      inputTokens: 375,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 375,
      costUsd: 1.5,
    });
    expect(today.tasks).toBe(5); // w9～w13 都是今天创建的
    expect(today.runMs).toBe(5_420_500);
    // 分母：w9、w10、w11、w1（r12 是 w1 的第二次运行）
    expect(today.avgRunMs).toBe(1_355_125);
  });

  it("还在跑的运行按 nowMs − startedAt 算耗时", () => {
    const { total, today } = computeStats(mainInput({ range: { kind: "today" } }));
    // r11 本地 13:00 开跑，now 是本地 14:30 → 90 分钟
    expect(total.runMs).toBe(5_420_500);
    expect(today.runMs).toBe(5_420_500);
  });

  it("runMs 为 0 时不被 now − startedAt 覆盖", () => {
    const runs = mainRuns().map((run) =>
      run.runId === "r9" ? { ...run, runMs: 0, endedAt: "2026-09-25T01:30:00Z" } : run,
    );
    const { total } = computeStats(mainInput({ range: { kind: "today" }, runs }));
    expect(total.runMs).toBe(5_420_500 - 9_000);
  });

  it("范围外的事实被过滤掉（起点之前的不算）", () => {
    const runs = [
      ...mainRuns(),
      {
        ...templateRun(),
        runId: "old-run",
        startedAt: "2026-09-01T05:00:00Z",
        totalTokens: 999_999,
      },
    ];
    const workers = [
      ...mainWorkers(),
      { ...templateWorker(), workerId: "old-worker", createdAt: "2026-09-01T04:00:00Z" },
    ];
    const { total } = computeStats(mainInput({ runs, workers }));
    expect(total.usage).toEqual(EXPECTED_TOTAL_USAGE);
    expect(total.tasks).toBe(13);
  });

  it("终点是不含的：正好在 toMs 开跑的运行不算", () => {
    const runs = [
      ...mainRuns(),
      {
        ...templateRun(),
        runId: "at-now",
        startedAt: new Date(NOW).toISOString(),
        totalTokens: 777,
      },
    ];
    const { total } = computeStats(mainInput({ runs }));
    expect(total.usage).toEqual(EXPECTED_TOTAL_USAGE);
  });

  it("起点是含的：正好在起点开跑的运行算", () => {
    const runs = [
      ...mainRuns(),
      {
        ...templateRun(),
        runId: "at-start",
        startedAt: new Date(WEEK_START).toISOString(),
        totalTokens: 777,
      },
    ];
    const { total } = computeStats(mainInput({ runs }));
    expect(total.usage.totalTokens).toBe(5575 + 777);
    expect(total.avgRunMs).toBe(Math.round((16_252_500 + 1_000) / 11));
  });

  it("没有运行只有任务时平均耗时为 null", () => {
    const stats = computeStats(mainInput({ runs: [] }));
    expect(stats.total.usage.totalTokens).toBe(0);
    expect(stats.total.usage.costUsd).toBeNull();
    expect(stats.total.runMs).toBe(0);
    expect(stats.total.avgRunMs).toBeNull();
    expect(stats.total.tasks).toBe(13);
  });

  it("任务的创建时间决定它算在哪个范围里", () => {
    const { total } = computeStats(mainInput({ range: { kind: "today" } }));
    expect(total.tasks).toBe(5);
    const { total: allTotal } = computeStats(mainInput({ range: { kind: "all" } }));
    expect(allTotal.tasks).toBe(13);
  });
});
