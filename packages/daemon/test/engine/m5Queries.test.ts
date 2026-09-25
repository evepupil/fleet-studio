import { type RunRecord, statsQuerySchema, tasksQuerySchema, type WorkerRecord } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { queryStats } from "../../src/engine/statsQueries.js";
import { listProjects, queryTasks } from "../../src/engine/taskQueries.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./support/records.js";
import { createTestEngine, type TestEngine } from "./support/testEngine.js";

const NOW_MS = Date.parse("2026-01-02T16:30:00.000Z");

function seedTask(
  engine: TestEngine,
  id: string,
  createdAt: string,
  projectKey: string,
  status: RunRecord["status"],
  runOverrides: Partial<RunRecord> = {},
): { worker: WorkerRecord; run: RunRecord } {
  const worker = createWorkerRecord({
    id,
    projectKey,
    cwd: `C:\\code\\${id}`,
    title: `Task ${id}`,
    requestedPool: "dsf",
    poolId: "dsf",
    model: "vendor/model-v2",
    channel: "vendor",
    modelName: "model-v2",
    createdAt,
  });
  const run = createRunRecord({
    id: `${id}.1`,
    workerId: id,
    status,
    queuedAt: createdAt,
    startedAt: status === "running" || status === "completed" ? createdAt : null,
    endedAt: status === "completed" ? createdAt : null,
    ...runOverrides,
  });
  engine.repos.projects.insert(
    createProjectRecord({ key: projectKey, path: `C:\\code\\${id}`, name: id }),
  );
  engine.repos.workers.insert(worker);
  engine.repos.runs.insert(run);
  return { worker, run };
}

describe("M5 查询服务：统计、任务列表和项目", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = await createTestEngine({ initialNowMs: NOW_MS });
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("统计 facts 查询从自选范围与本地今天的较早点开始", () => {
    const projectKey = "c:\\code\\stats";
    const today = "2026-01-02T15:30:00.000Z";
    seedTask(engine, "wstats01", today, projectKey, "completed", {
      endedAt: "2026-01-02T15:40:00.000Z",
      runMs: 10 * 60_000,
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 30,
        costUsd: 0,
      },
    });
    const fixedZone = { offsetMinutes: () => 9 * 60 };
    const query = statsQuerySchema.parse({
      range: "custom",
      from: "2026-01-04",
      to: "2026-01-04",
      dimension: "model",
    });

    const response = queryStats(engine.ctx, query, fixedZone);

    expect(response.total.usage.totalTokens).toBe(0);
    expect(response.today.usage.totalTokens).toBe(30);
    expect(response.today.runMs).toBe(10 * 60_000);
  });

  it("任务查询应用筛选、排序、游标，并装配 worker 摘要", () => {
    const projectA = "c:\\code\\alpha";
    const projectB = "c:\\code\\beta";
    seedTask(engine, "wtask001", "2026-01-01T08:00:00.000Z", projectA, "completed", {
      endedAt: "2026-01-01T08:05:00.000Z",
      runMs: 5 * 60_000,
    });
    seedTask(engine, "wtask002", "2026-01-01T09:00:00.000Z", projectB, "completed", {
      endedAt: "2026-01-01T09:05:00.000Z",
      runMs: 5 * 60_000,
    });

    const first = queryTasks(
      engine.ctx,
      tasksQuerySchema.parse({
        status: "all",
        range: "all",
        sort: "createdAt",
        order: "desc",
        limit: 1,
      }),
    );
    const second = queryTasks(
      engine.ctx,
      tasksQuerySchema.parse({
        status: "all",
        range: "all",
        sort: "createdAt",
        order: "desc",
        limit: 1,
        cursor: first.nextCursor ?? undefined,
      }),
    );

    expect(first.items[0]).toMatchObject({
      id: "wtask002",
      status: "completed",
      poolId: "dsf",
      channel: "vendor",
      modelName: "model-v2",
    });
    expect(first.total).toBe(2);
    expect(first.nextCursor).not.toBeNull();
    expect(second.items[0]?.id).toBe("wtask001");
    expect(second.nextCursor).toBeNull();
  });

  it("项目列表按名称大小写无关排序并只返回契约字段", () => {
    engine.repos.projects.insert(
      createProjectRecord({ key: "c:\\code\\zulu", name: "zulu", colorIndex: 2 }),
    );
    engine.repos.projects.insert(
      createProjectRecord({ key: "c:\\code\\alpha", name: "Alpha", colorIndex: 1 }),
    );

    expect(listProjects(engine.ctx)).toEqual([
      {
        key: "c:\\code\\alpha",
        path: "C:\\code\\demo",
        name: "Alpha",
        colorIndex: 1,
      },
      {
        key: "c:\\code\\zulu",
        path: "C:\\code\\demo",
        name: "zulu",
        colorIndex: 2,
      },
    ]);
  });
});
