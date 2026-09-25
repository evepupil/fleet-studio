import { describe, expect, it } from "vitest";
import { computeStats } from "../../src/stats/index.js";
import { mainInput, mainLabels, mainRuns, NOW } from "./fixtures.js";

describe("computeStats：token 分布", () => {
  it("前 8 名 + 「其他」：第 9、10 名并进「其他」", () => {
    const { tokenShare } = computeStats(mainInput());
    expect(tokenShare.map((item) => item.key)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
      "m7",
      "m8",
      "",
    ]);

    const other = tokenShare[8];
    expect(other).toMatchObject({ key: "", label: "其他", colorIndex: null, isOther: true });
    // 落选的 m9（w9，200）、m10（w10，100）
    expect(other?.tokens).toBe(300);
    expect(other?.runMs).toBe(9_000 + 10_000);
    // tasks 直接相加：两个组各一个任务，合并后是两个
    expect(other?.tasks).toBe(2);
  });

  it("每组的 tokens、runMs、tasks（不同任务数）", () => {
    const { tokenShare } = computeStats(mainInput());
    const byKey = new Map(tokenShare.map((item) => [item.key, item] as const));
    expect(byKey.get("m1")).toEqual({
      key: "m1",
      label: "m1",
      colorIndex: 0,
      isOther: false,
      // w1 有两次运行（r1、r12），加上还在跑的 w11（r11），只算两个任务
      tasks: 2,
      tokens: 1_075,
      runMs: 1_000 + 1_500 + 5_400_000,
    });
    expect(byKey.get("m4")?.runMs).toBe(10_800_000);
    expect(byKey.get("m4")?.tasks).toBe(1);
    expect(byKey.get("m8")?.tokens).toBe(300);
    expect(byKey.get("m8")?.colorIndex).toBe(7);
  });

  it("模型的显示名就是键本身，配色走 seriesColor", () => {
    const labels = mainLabels();
    const { tokenShare } = computeStats(mainInput({ labels }));
    expect(tokenShare[0]).toMatchObject({ key: "m1", label: "m1", colorIndex: 0 });
    expect(tokenShare[1]).toMatchObject({ key: "m2", label: "m2", colorIndex: 1 });
    expect(labels.seriesCalls).toContainEqual(["model", "m1"]);
    expect(labels.seriesCalls).toContainEqual(["model", "m8"]);
    // 「其他」不该去查配色
    expect(labels.seriesCalls.some(([, key]) => key === "")).toBe(false);
  });

  it("project 维度：显示名和配色都用项目表", () => {
    const labels = mainLabels();
    const { tokenShare } = computeStats(mainInput({ dimension: "project", labels }));
    const byKey = new Map(tokenShare.map((item) => [item.key, item] as const));
    expect(byKey.get("p1")).toMatchObject({ label: "项目一", colorIndex: 1, tokens: 2_425 });
    expect(byKey.get("p2")).toMatchObject({ label: "项目二", colorIndex: 2, tokens: 1_850 });
    expect(byKey.get("p3")).toMatchObject({ label: "项目三", colorIndex: 3, tokens: 1_300 });
    // p4 只在任务里出现过（w13 没跑过），没有运行就没有 token，不进分布
    expect(byKey.has("p4")).toBe(false);
    expect(labels.seriesCalls).toEqual([]);
  });

  it("project 维度：没有运行的项目不出现", () => {
    const { tokenShare } = computeStats(mainInput({ dimension: "project" }));
    expect(tokenShare.map((item) => item.key)).toEqual(["p1", "p2", "p3"]);
  });

  it("channel 维度：按渠道合并，显示名是渠道名", () => {
    const labels = mainLabels();
    const { tokenShare } = computeStats(mainInput({ dimension: "channel", labels }));
    expect(tokenShare.map((item) => item.key)).toEqual(["cA", "cB", "cC"]);
    expect(tokenShare[0]).toMatchObject({ label: "cA", tokens: 2_425 });
    expect(labels.seriesCalls).toContainEqual(["channel", "cA"]);
  });

  it("role 维度：显示名用角色表，配色走 seriesColor", () => {
    const labels = mainLabels();
    const { tokenShare } = computeStats(mainInput({ dimension: "role", labels }));
    const byKey = new Map(tokenShare.map((item) => [item.key, item] as const));
    expect(byKey.get("r1")).toMatchObject({ label: "写手", tokens: 2_425 });
    expect(byKey.get("r2")).toMatchObject({ label: "审稿", tokens: 1_850 });
    expect(byKey.get("r3")).toMatchObject({ label: "研究员", tokens: 1_300 });
    expect(labels.seriesCalls).toContainEqual(["role", "r1"]);
  });

  it("没有任务事实的运行跳过，取不到键的归到 unknown", () => {
    const { tokenShare } = computeStats(
      mainInput({
        workers: mainInput().workers.map((worker) =>
          worker.workerId === "w1" ? { ...worker, modelName: null } : worker,
        ),
      }),
    );
    const byKey = new Map(tokenShare.map((item) => [item.key, item] as const));
    // w1 的两次运行（1000 + 25）归到 unknown
    expect(byKey.get("unknown")).toMatchObject({
      label: "未知",
      colorIndex: 7,
      tokens: 1_025,
      tasks: 1,
    });
  });

  it("真实叫 unknown 的模型和取不到模型名的运行是两行", () => {
    // w1 的模型真叫 "unknown"，w2 取不到模型名（null）。对外 key 都是 "unknown"，
    // 但必须分成两行：前者是真实模型，显示名是它自己；后者是数据缺失，显示名「未知」。
    const { tokenShare, tokenTrend } = computeStats(
      mainInput({
        workers: mainInput().workers.map((worker) => {
          if (worker.workerId === "w1") {
            return { ...worker, modelName: "unknown" };
          }
          if (worker.workerId === "w2") {
            return { ...worker, modelName: null };
          }
          return worker;
        }),
      }),
    );
    const unknownRows = tokenShare.filter((item) => item.key === "unknown");
    expect(unknownRows).toHaveLength(2);
    // w1 的两次运行（1000 + 25）是真实模型，显示名就是键本身，配色走 seriesColor。
    expect(unknownRows[0]).toMatchObject({ label: "unknown", colorIndex: 0, tokens: 1_025 });
    // w2 的一次运行（900）是缺失值，显示名「未知」，固定配色 7。
    expect(unknownRows[1]).toMatchObject({ label: "未知", colorIndex: 7, tokens: 900 });
    // 趋势图也是两条线，不合并。
    expect(tokenTrend.filter((line) => line.key === "unknown")).toHaveLength(2);
  });

  it("完全没有运行事实的任务不参与 token 分布", () => {
    const { tokenShare } = computeStats(mainInput({ runs: [] }));
    expect(tokenShare).toEqual([]);
  });

  it("找不到任务事实的运行跳过（不计入分布，但仍计入总用量）", () => {
    const runs = mainRuns().map((run) =>
      run.runId === "r9" ? { ...run, workerId: "ghost" } : run,
    );
    const stats = computeStats(mainInput({ runs }));
    expect(stats.tokenShare.map((item) => item.key)).not.toContain("m9");
    expect(stats.total.usage.totalTokens).toBe(5_575);
    expect(stats.total.avgRunMs).toBe(Math.round(16_252_500 / 11));
    // 按项目的分布里也找不到这个幽灵任务
    expect(stats.tasksByProject.reduce((sum, item) => sum + item.runMs, 0)).toBe(
      16_252_500 - 9_000,
    );
  });

  it("超过 8 项时「其他」排最后，且顺序按 tokens 从多到少", () => {
    const { tokenShare } = computeStats(mainInput());
    const tokens = tokenShare.map((item) => item.tokens);
    const sorted = [...tokens].sort((a, b) => b - a);
    expect(tokens).toEqual(sorted);
  });
});

describe("computeStats：任务次数分布（按项目）", () => {
  it("tasks 是范围内创建的任务数，tokens / runMs 是该项目范围内运行的合计", () => {
    const { tasksByProject } = computeStats(mainInput());
    expect(tasksByProject).toEqual([
      {
        key: "p1",
        label: "项目一",
        colorIndex: 1,
        isOther: false,
        tasks: 4, // w1、w2、w7、w10
        tokens: 2_425,
        runMs: 1_000 + 2_000 + 7_000 + 10_000 + 1_500,
      },
      {
        key: "p2",
        label: "项目二",
        colorIndex: 2,
        isOther: false,
        tasks: 4, // w3、w4、w8、w11
        tokens: 1_850,
        runMs: 3_000 + 10_800_000 + 8_000 + 5_400_000,
      },
      {
        key: "p3",
        label: "项目三",
        colorIndex: 3,
        isOther: false,
        tasks: 4, // w5、w6、w9、w12
        tokens: 1_300,
        runMs: 5_000 + 6_000 + 9_000,
      },
      {
        key: "p4",
        label: "p4", // 没有配名字就用 key
        colorIndex: 0, // 没有配项目色就用 0
        isOther: false,
        tasks: 1, // w13 创建了但没跑过
        tokens: 0,
        runMs: 0,
      },
    ]);
  });

  it("tasks 为 0 且 tokens 为 0 的项目不出现", () => {
    const { tasksByProject } = computeStats(mainInput({ range: { kind: "today" } }));
    // 今天创建的任务：w9、w10（p3 / p1）、w11（p2）、w12（p3）、w13（p4）
    expect(tasksByProject.map((item) => item.key)).toEqual(["p3", "p1", "p2", "p4"]);
  });

  it("按 tasks 排序，tasks 相同时保持原顺序", () => {
    const { tasksByProject } = computeStats(mainInput());
    expect(tasksByProject.map((item) => item.tasks)).toEqual([4, 4, 4, 1]);
    expect(tasksByProject.map((item) => item.key)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("超过 8 个项目时按 tasks 取前 8，其余并成「其他」", () => {
    const workers = Array.from({ length: 10 }, (_, index) => ({
      workerId: `worker-${index}`,
      createdAt: "2026-09-24T05:00:00Z",
      projectKey: `project-${index}`,
      role: "r1",
      channel: null,
      modelName: null,
    }));
    const runs = workers.map((worker, index) => ({
      runId: `run-${index}`,
      workerId: worker.workerId,
      startedAt: "2026-09-24T06:00:00Z",
      endedAt: null,
      runMs: 1_000,
      inputTokens: 10,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 10 * (index + 1),
      costUsd: null,
    }));
    const { tasksByProject } = computeStats(mainInput({ runs, workers }));
    expect(tasksByProject).toHaveLength(9);
    expect(tasksByProject[8]).toMatchObject({
      key: "",
      label: "其他",
      colorIndex: null,
      isOther: true,
      tasks: 2,
      tokens: 90 + 100,
    });
  });

  it("任务在范围外创建、但范围内跑过的项目也会出现", () => {
    const workers = mainInput().workers.map((worker) =>
      worker.workerId === "w1" ? { ...worker, createdAt: "2026-09-01T00:00:00Z" } : worker,
    );
    const { tasksByProject } = computeStats(mainInput({ workers }));
    const p1 = tasksByProject.find((item) => item.key === "p1");
    expect(p1?.tasks).toBe(3); // w1 不算，剩下 w2、w7、w10
    expect(p1?.tokens).toBe(2_425);
  });
});

describe("computeStats：token 趋势", () => {
  it("线的集合与顺序和 tokenShare 完全相同", () => {
    const stats = computeStats(mainInput());
    expect(stats.tokenTrend.map((line) => line.key)).toEqual(
      stats.tokenShare.map((item) => item.key),
    );
    expect(stats.tokenTrend.map((line) => line.label)).toEqual(
      stats.tokenShare.map((item) => item.label),
    );
    expect(stats.tokenTrend.map((line) => line.colorIndex)).toEqual(
      stats.tokenShare.map((item) => item.colorIndex),
    );
    expect(stats.tokenTrend.map((line) => line.isOther)).toEqual(
      stats.tokenShare.map((item) => item.isOther),
    );
  });

  it("每段是「该组在这一段开跑的运行」的 token 合计", () => {
    const { tokenTrend } = computeStats(mainInput());
    const byKey = new Map(tokenTrend.map((line) => [line.key, line.points] as const));

    // 分段从本地 09-19 00:00 开始：r1（本地 09-19 13:00）落在第 0 段，
    // r12（本地 09-25 13:30）和还在跑的 r11（本地 09-25 13:00）落在第 6 段。
    expect(byKey.get("m1")).toEqual([1_000, 0, 0, 0, 0, 0, 75]);
    expect(byKey.get("m2")).toEqual([0, 900, 0, 0, 0, 0, 0]);
    expect(byKey.get("m3")).toEqual([0, 0, 800, 0, 0, 0, 0]);
    // r4 跨本地零点（本地 09-22 23:00 开跑），整段都算在 09-22
    expect(byKey.get("m4")).toEqual([0, 0, 0, 700, 0, 0, 0]);
    expect(byKey.get("m5")).toEqual([0, 0, 0, 0, 600, 0, 0]);
    expect(byKey.get("m6")).toEqual([0, 0, 0, 0, 500, 0, 0]);
    expect(byKey.get("m7")).toEqual([0, 0, 0, 0, 0, 400, 0]);
    expect(byKey.get("m8")).toEqual([0, 0, 0, 0, 0, 300, 0]);
    // 「其他」：m9（r9）、m10（r10）都在今天
    expect(byKey.get("")).toEqual([0, 0, 0, 0, 0, 0, 300]);
  });

  it("每条线的点数等于分段数", () => {
    for (const range of [{ kind: "today" }, { kind: "7d" }, { kind: "all" }] as const) {
      const stats = computeStats(mainInput({ range }));
      for (const line of stats.tokenTrend) {
        expect(line.points).toHaveLength(stats.buckets.length);
      }
    }
  });

  it("没有分段时每条线都是空数组", () => {
    const stats = computeStats(mainInput({ range: { kind: "all" }, runs: [], workers: [] }));
    expect(stats.tokenTrend).toEqual([]);
  });

  it("分段起点之后的运行归到对应段，段起点正好相等时算该段", () => {
    const runs = [
      {
        runId: "edge",
        workerId: "w1",
        startedAt: "2026-09-24T16:00:00Z", // 本地 09-25 00:00，正好是最后一段的起点
        endedAt: null,
        runMs: 1_000,
        inputTokens: 5,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 5,
        costUsd: null,
      },
    ];
    const stats = computeStats(mainInput({ runs, dimension: "model" }));
    expect(stats.tokenTrend[0]?.points).toEqual([0, 0, 0, 0, 0, 0, 5]);
    expect(stats.tokenShare[0]?.tokens).toBe(5);
  });

  it("趋势里的数值都是有限数（没有 NaN）", () => {
    const stats = computeStats(mainInput({ range: { kind: "all" } }));
    for (const line of stats.tokenTrend) {
      for (const point of line.points) {
        expect(Number.isFinite(point)).toBe(true);
      }
    }
    expect(stats.range.to).toBe(new Date(NOW).toISOString());
  });
});
