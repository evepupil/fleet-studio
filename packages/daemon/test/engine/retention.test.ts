import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runRetentionSweep } from "../../src/engine/retention.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./support/records.js";
import { baselineConfig, createTestEngine, type TestEngine } from "./support/testEngine.js";

const NOW_MS = Date.parse("2026-02-01T00:00:00.000Z");
const RETENTION_DAYS = 7;

async function seedFinishedWorker(
  engine: TestEngine,
  id: string,
  endedAt: string,
): Promise<{ workerId: string; runDir: string }> {
  const worker = createWorkerRecord({ id, projectKey: `c:\\code\\${id}`, cwd: `C:\\code\\${id}` });
  const run = createRunRecord({
    id: `${id}.1`,
    workerId: id,
    status: "completed",
    startedAt: endedAt,
    endedAt,
  });
  engine.repos.projects.insert(
    createProjectRecord({ key: worker.projectKey, path: worker.cwd, createdAt: endedAt }),
  );
  engine.repos.workers.insert(worker);
  engine.repos.runs.insert(run);

  const runDir = engine.ctx.deps.paths.runDir(run.id);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "out.jsonl"), "some output", "utf8");
  return { workerId: id, runDir };
}

describe("retention：过期清理（模块设计 3.15）", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    const baseline = baselineConfig();
    engine = await createTestEngine({
      initialNowMs: NOW_MS,
      config: { ...baseline, retentionDays: RETENTION_DAYS },
    });
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("最新运行已终态且结束时间早于 cutoff：删掉苦工、运行记录和磁盘目录", async () => {
    const oldEndedAt = new Date(NOW_MS - (RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
    const { workerId } = await seedFinishedWorker(engine, "wold0001", oldEndedAt);

    await runRetentionSweep(engine.ctx);

    expect(engine.repos.workers.get(workerId)).toBeNull();
    expect(engine.repos.runs.get(`${workerId}.1`)).toBeNull();
  });

  it("结束时间在保留期内的苦工不受影响", async () => {
    const recentEndedAt = new Date(NOW_MS - 1 * 24 * 60 * 60 * 1000).toISOString();
    const { workerId } = await seedFinishedWorker(engine, "wnew0001", recentEndedAt);

    await runRetentionSweep(engine.ctx);

    expect(engine.repos.workers.get(workerId)).not.toBeNull();
  });

  it("最新运行还没结束（工作中）：不管多久之前创建的都不删", async () => {
    const worker = createWorkerRecord({ id: "wbusy999", createdAt: "2020-01-01T00:00:00.000Z" });
    const run = createRunRecord({
      id: "wbusy999.1",
      workerId: "wbusy999",
      status: "running",
      startedAt: "2020-01-01T00:00:01.000Z",
    });
    engine.repos.projects.insert(createProjectRecord({ key: worker.projectKey, path: worker.cwd }));
    engine.repos.workers.insert(worker);
    engine.repos.runs.insert(run);

    await runRetentionSweep(engine.ctx);

    expect(engine.repos.workers.get("wbusy999")).not.toBeNull();
  });

  it("没有任何苦工、创建时间早于 cutoff 的项目会被删掉", async () => {
    const oldCreatedAt = new Date(
      NOW_MS - (RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000,
    ).toISOString();
    engine.repos.projects.insert(
      createProjectRecord({
        key: "c:\\code\\orphan",
        path: "C:\\code\\orphan",
        createdAt: oldCreatedAt,
      }),
    );

    await runRetentionSweep(engine.ctx);

    expect(engine.repos.projects.get("c:\\code\\orphan")).toBeNull();
  });

  it("F6a 回归：删掉苦工时同步通知 timelineStore 忘掉它，避免缓存表只增不减", async () => {
    const oldEndedAt = new Date(NOW_MS - (RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
    const { workerId } = await seedFinishedWorker(engine, "wforget1", oldEndedAt);

    const forgotten: string[] = [];
    const originalForget = engine.ctx.timelines.forget;
    engine.ctx.timelines.forget = (id: string): void => {
      forgotten.push(id);
      originalForget(id);
    };

    await runRetentionSweep(engine.ctx);

    expect(forgotten).toEqual([workerId]);
  });

  it("清理完之后记一条日志，写明删了多少", async () => {
    const oldEndedAt = new Date(NOW_MS - (RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
    await seedFinishedWorker(engine, "wlog0001", oldEndedAt);

    await runRetentionSweep(engine.ctx);

    expect(
      engine.logger.records.some(
        (record) => record.level === "info" && record.message.includes("1"),
      ),
    ).toBe(true);
  });
});
