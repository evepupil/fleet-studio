import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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
  await Promise.all(
    ["out.jsonl", "err.log", "task.md", "timeline.jsonl"].map((file) =>
      writeFile(join(runDir, file), file, "utf8"),
    ),
  );
  return { workerId: id, runDir };
}

describe("retention：原始输出清理（M5）", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    const baseline = baselineConfig();
    engine = await createTestEngine({
      initialNowMs: NOW_MS,
      config: { ...baseline, rawOutputRetentionDays: RETENTION_DAYS },
    });
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("删除到期原始输出，保留时间线、任务记录、运行记录和项目，并标记运行", async () => {
    const oldEndedAt = new Date(NOW_MS - (RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
    const { workerId, runDir } = await seedFinishedWorker(engine, "wold0001", oldEndedAt);

    await runRetentionSweep(engine.ctx);

    for (const file of ["out.jsonl", "err.log", "task.md"]) {
      await expect(stat(join(runDir, file))).rejects.toThrow();
    }
    await expect(readFile(join(runDir, "timeline.jsonl"), "utf8")).resolves.toBe("timeline.jsonl");
    expect(engine.repos.workers.get(workerId)).not.toBeNull();
    expect(engine.repos.runs.get(`${workerId}.1`)).not.toBeNull();
    expect(engine.repos.projects.get(`c:\\code\\${workerId}`)).not.toBeNull();
    expect(engine.repos.runs.listRawPurgeCandidates("9999-01-01T00:00:00.000Z", 10)).toEqual([]);
  });

  it("保留期内的原始输出不动", async () => {
    const recentEndedAt = new Date(NOW_MS - 1 * 24 * 60 * 60 * 1000).toISOString();
    const { runDir } = await seedFinishedWorker(engine, "wnew0001", recentEndedAt);

    await runRetentionSweep(engine.ctx);

    await expect(readFile(join(runDir, "out.jsonl"), "utf8")).resolves.toBe("out.jsonl");
    expect(engine.repos.runs.listRawPurgeCandidates("9999-01-01T00:00:00.000Z", 10)).toHaveLength(
      1,
    );
  });

  it("单个文件删除失败时不标记该运行，下次还会重试", async () => {
    const oldEndedAt = new Date(NOW_MS - (RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
    const { workerId, runDir } = await seedFinishedWorker(engine, "wfail001", oldEndedAt);
    await rm(join(runDir, "out.jsonl"));
    await mkdir(join(runDir, "out.jsonl"));

    await runRetentionSweep(engine.ctx);

    expect(engine.repos.runs.listRawPurgeCandidates("9999-01-01T00:00:00.000Z", 10)).toEqual([
      { id: `${workerId}.1` },
    ]);
    expect(engine.logger.records.some((record) => record.level === "error")).toBe(true);
    expect(engine.repos.workers.get(workerId)).not.toBeNull();
  });

  it("记录已清理运行的数量", async () => {
    const oldEndedAt = new Date(NOW_MS - (RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
    await seedFinishedWorker(engine, "wlog0001", oldEndedAt);

    await runRetentionSweep(engine.ctx);

    expect(
      engine.logger.records.some(
        (record) => record.level === "info" && record.message.includes("1 个运行"),
      ),
    ).toBe(true);
  });
});
