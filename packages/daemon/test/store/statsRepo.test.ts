import { describe, expect, it } from "vitest";
import { createRepos, createStatsRepo, openDatabase } from "../../src/store/index.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./factories.js";

describe("statsRepo", () => {
  it("runFacts 只返回开跑过且不早于 since 的运行事实", () => {
    const repos = createRepos(":memory:");
    repos.projects.insert(createProjectRecord({ key: "p1" }));
    repos.workers.insert(createWorkerRecord({ id: "w1", projectKey: "p1" }));
    repos.runs.insert(
      createRunRecord({
        id: "w1.1",
        workerId: "w1",
        startedAt: "2026-01-01T00:00:00.000Z",
        runMs: 100,
      }),
    );
    repos.runs.insert(
      createRunRecord({
        id: "w1.2",
        workerId: "w1",
        seq: 2,
        startedAt: "2026-01-03T00:00:00.000Z",
        endedAt: null,
        usage: {
          inputTokens: 4,
          outputTokens: 5,
          cacheReadTokens: 6,
          cacheWriteTokens: 7,
          totalTokens: 22,
          costUsd: null,
        },
      }),
    );
    repos.runs.insert(createRunRecord({ id: "w1.3", workerId: "w1", seq: 3 }));

    expect(repos.stats.runFacts("2026-01-02T00:00:00.000Z")).toEqual([
      {
        runId: "w1.2",
        workerId: "w1",
        startedAt: "2026-01-03T00:00:00.000Z",
        endedAt: null,
        runMs: null,
        inputTokens: 4,
        outputTokens: 5,
        cacheReadTokens: 6,
        cacheWriteTokens: 7,
        totalTokens: 22,
        costUsd: null,
      },
    ]);
    expect(repos.stats.runFacts(null)).toHaveLength(2);
    repos.close();
  });

  it("workerFacts 合并时间范围和 alsoIds，并对额外编号分批去重", () => {
    const repos = createRepos(":memory:");
    repos.projects.insert(createProjectRecord({ key: "p1" }));
    repos.workers.insert(
      createWorkerRecord({
        id: "w-old",
        projectKey: "p1",
        createdAt: "2026-01-01T00:00:00.000Z",
        channel: null,
        modelName: null,
      }),
    );
    repos.workers.insert(
      createWorkerRecord({
        id: "w-recent",
        projectKey: "p1",
        createdAt: "2026-01-03T00:00:00.000Z",
        channel: "provider",
        modelName: "model",
      }),
    );
    const alsoIds = [
      ...Array.from({ length: 500 }, (_, index) => `missing-${index}`),
      "w-old",
      "w-recent",
      "w-old",
    ];

    const facts = repos.stats.workerFacts("2026-01-02T00:00:00.000Z", alsoIds);
    expect(facts.map((fact) => fact.workerId).sort()).toEqual(["w-old", "w-recent"]);
    expect(facts.find((fact) => fact.workerId === "w-old")).toMatchObject({
      channel: null,
      modelName: null,
    });
    expect(repos.stats.workerFacts(null, ["unknown"])).toHaveLength(2);
    repos.close();
  });

  it("seriesColor 固定分配、同一维度取最小空位、不同维度隔离", () => {
    const repos = createRepos(":memory:");
    const first = repos.stats.seriesColor("model", "model-a", "2026-01-01T00:00:00.000Z");
    expect(first).toBe(0);
    expect(repos.stats.seriesColor("model", "model-a", "2026-02-01T00:00:00.000Z")).toBe(0);
    expect(repos.stats.seriesColor("model", "model-b", "2026-01-02T00:00:00.000Z")).toBe(1);
    expect(repos.stats.seriesColor("channel", "model-a", "2026-01-03T00:00:00.000Z")).toBe(0);
    expect(repos.stats.seriesColor("role", "worker", "2026-01-04T00:00:00.000Z")).toBe(0);
    repos.close();
  });

  it("seriesColor 分配过三个之后删掉中间那个，新名字拿回空出来的位置", () => {
    const db = openDatabase(":memory:");
    const stats = createStatsRepo(db);
    expect(stats.seriesColor("model", "a", "2026-01-01T00:00:00.000Z")).toBe(0);
    expect(stats.seriesColor("model", "b", "2026-01-01T00:00:00.000Z")).toBe(1);
    expect(stats.seriesColor("model", "c", "2026-01-01T00:00:00.000Z")).toBe(2);

    // 删掉中间那一行（1 号位），空出来的位置应该优先给新名字（pickColorIndex 取最小空位）。
    db.prepare("DELETE FROM series_colors WHERE kind = ? AND name = ?;").run("model", "b");
    expect(stats.seriesColor("model", "d", "2026-01-02T00:00:00.000Z")).toBe(1);

    // 已分配的名字不受影响，重新拿到原来的位置。
    expect(stats.seriesColor("model", "c", "2026-01-03T00:00:00.000Z")).toBe(2);
    db.close();
  });
});
