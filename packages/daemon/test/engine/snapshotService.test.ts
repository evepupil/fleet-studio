import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSnapshotService } from "../../src/engine/snapshotService.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./support/records.js";
import { createTestEngine, type TestEngine } from "./support/testEngine.js";

describe("snapshotService：快照缓存（模块设计 3.11）", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = await createTestEngine({ initialNowMs: Date.parse("2026-01-01T12:00:00.000Z") });
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("不脏且距上次计算不到 5 秒时返回缓存：新加的苦工不会立刻出现", async () => {
    const service = createSnapshotService({
      repos: engine.repos,
      config: engine.config,
      version: "test",
      now: engine.ctx.now,
    });
    const before = service.get();
    expect(before.workers).toHaveLength(0);

    const worker = createWorkerRecord();
    engine.repos.projects.insert(createProjectRecord({ key: worker.projectKey, path: worker.cwd }));
    engine.repos.workers.insert(worker);
    engine.repos.runs.insert(createRunRecord({ status: "queued" }));

    engine.advanceNow(1000);
    const stillCached = service.get();
    expect(stillCached.workers).toHaveLength(0);
  });

  it("markDirty 之后立即重算，能看到刚插入的苦工", async () => {
    const service = createSnapshotService({
      repos: engine.repos,
      config: engine.config,
      version: "test",
      now: engine.ctx.now,
    });
    service.get();

    const worker = createWorkerRecord();
    engine.repos.projects.insert(createProjectRecord({ key: worker.projectKey, path: worker.cwd }));
    engine.repos.workers.insert(worker);
    engine.repos.runs.insert(createRunRecord({ status: "queued" }));
    service.markDirty();

    const updated = service.get();
    expect(updated.workers.map((w) => w.id)).toContain(worker.id);
  });

  it("即使没有 markDirty，超过 5 秒后也会重新计算（serverTime 会跟着往前走）", async () => {
    const service = createSnapshotService({
      repos: engine.repos,
      config: engine.config,
      version: "test",
      now: engine.ctx.now,
    });
    const before = service.get();

    engine.advanceNow(5001);
    const after = service.get();

    expect(after.serverTime).not.toBe(before.serverTime);
  });

  it("queuePositions 永远是最新的，不受 5 秒缓存影响", async () => {
    const service = createSnapshotService({
      repos: engine.repos,
      config: engine.config,
      version: "test",
      now: engine.ctx.now,
    });
    const worker = createWorkerRecord();
    engine.repos.projects.insert(createProjectRecord({ key: worker.projectKey, path: worker.cwd }));
    engine.repos.workers.insert(worker);
    engine.repos.runs.insert(createRunRecord({ status: "queued" }));

    const positions = service.queuePositions();
    expect(positions.get(`${worker.id}.1`)).toBe(1);
  });
});
