import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getHealth,
  getWorkerDetail,
  listPools,
  listRoles,
  listWorkers,
  patchPool,
} from "../../src/engine/queries.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./support/records.js";
import { createTestEngine, type TestEngine } from "./support/testEngine.js";

function seed(engine: TestEngine, workerOverrides: Parameters<typeof createWorkerRecord>[0] = {}) {
  const worker = createWorkerRecord(workerOverrides);
  if (engine.repos.projects.get(worker.projectKey) === null) {
    engine.repos.projects.insert(createProjectRecord({ key: worker.projectKey, path: worker.cwd }));
  }
  engine.repos.workers.insert(worker);
  engine.repos.runs.insert(
    createRunRecord({ id: `${worker.id}.1`, workerId: worker.id, status: "queued" }),
  );
  return worker;
}

describe("queries：只读查询与池调整（模块设计 3.13）", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = await createTestEngine();
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("listWorkers：按 status 过滤", () => {
    seed(engine, { id: "wqueued1" });
    seed(engine, { id: "wqueued2" });
    const all = listWorkers(engine.ctx, { limit: 100 });
    expect(all).toHaveLength(2);
    const filtered = listWorkers(engine.ctx, { limit: 100, status: "running" });
    expect(filtered).toHaveLength(0);
  });

  it("listWorkers：project 参数会被归一化成项目键", () => {
    const worker = seed(engine, { id: "wproj001" });
    const found = listWorkers(engine.ctx, { limit: 100, project: worker.cwd.toUpperCase() });
    expect(found.map((w) => w.id)).toEqual(["wproj001"]);
  });

  it("getWorker：不存在返回 null；存在时返回完整详情", () => {
    expect(getWorkerDetail(engine.ctx, "wnoexist")).toBeNull();
    const worker = seed(engine, { id: "wdetail1" });
    const detail = getWorkerDetail(engine.ctx, worker.id);
    expect(detail?.summary.id).toBe(worker.id);
    expect(detail?.projectPath).toBe(worker.cwd);
    expect(detail?.runs).toHaveLength(1);
  });

  it("pools：直接取自快照", () => {
    const pools = listPools(engine.ctx);
    expect(pools.map((p) => p.id)).toContain("dsf");
  });

  it("roles：直接取自快照", () => {
    const roles = listRoles(engine.ctx);
    expect(roles.some((role) => role.id === "worker")).toBe(true);
  });

  it("patchPool：保存新配置、返回更新后的池视图", async () => {
    const view = await patchPool(engine.ctx, "dsf", { capacity: 5 });
    expect(view.capacity).toBe(5);
    expect(engine.config.current().pools[0]?.capacity).toBe(5);
    expect(engine.host.invalidateCallCount).toBeGreaterThan(0);
  });

  it("patchPool：池不存在时抛错，不会保存任何东西", async () => {
    const before = engine.config.saveCallCount;
    await expect(patchPool(engine.ctx, "no-such-pool", { capacity: 5 })).rejects.toBeTruthy();
    expect(engine.config.saveCallCount).toBe(before);
  });

  it("health：带上版本、启动时间、数据目录、端口", () => {
    const health = getHealth(engine.ctx);
    expect(health.ok).toBe(true);
    expect(health.version).toBe("test");
    expect(health.home).toBe(engine.home);
    expect(health.port).toBe(4870);
  });
});
