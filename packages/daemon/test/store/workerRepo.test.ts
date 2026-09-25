import type { DatabaseSync } from "node:sqlite";
import { isFleetError } from "@fleet/core";
import { describe, expect, it } from "vitest";
import {
  createProjectRepo,
  createRunRepo,
  createWorkerRepo,
  openDatabase,
} from "../../src/store/index.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./factories.js";

/** 每个用例独立开一个内存库，插好一个项目当外键落脚点。 */
function setup(): { db: DatabaseSync; workers: ReturnType<typeof createWorkerRepo> } {
  const db = openDatabase(":memory:");
  createProjectRepo(db).insert(createProjectRecord({ key: "p1" }));
  return { db, workers: createWorkerRepo(db) };
}

describe("workerRepo", () => {
  it("get：不存在返回 null；insert 后字段和写入一致", () => {
    const { workers } = setup();
    expect(workers.get("w1")).toBeNull();
    const worker = createWorkerRecord({ id: "w1", projectKey: "p1", sessionRef: "fleet-w1" });
    workers.insert(worker);
    expect(workers.get("w1")).toEqual(worker);
  });

  it("exists：插入前后分别是 false / true", () => {
    const { workers } = setup();
    expect(workers.exists("w1")).toBe(false);
    workers.insert(createWorkerRecord({ id: "w1", projectKey: "p1" }));
    expect(workers.exists("w1")).toBe(true);
  });

  describe("update", () => {
    it("patch 为空对象时什么都不改", () => {
      const { workers } = setup();
      const worker = createWorkerRecord({ id: "w1", projectKey: "p1", sessionRef: "fleet-w1" });
      workers.insert(worker);
      workers.update("w1", {});
      expect(workers.get("w1")).toEqual(worker);
    });

    it("只改 sessionRef，latestRunSeq 不受影响", () => {
      const { workers } = setup();
      workers.insert(
        createWorkerRecord({ id: "w1", projectKey: "p1", sessionRef: null, latestRunSeq: 2 }),
      );
      workers.update("w1", { sessionRef: "fleet-w1" });
      const updated = workers.get("w1");
      expect(updated?.sessionRef).toBe("fleet-w1");
      expect(updated?.latestRunSeq).toBe(2);
    });

    it("只改 latestRunSeq，sessionRef 不受影响", () => {
      const { workers } = setup();
      workers.insert(
        createWorkerRecord({ id: "w1", projectKey: "p1", sessionRef: "fleet-w1", latestRunSeq: 1 }),
      );
      workers.update("w1", { latestRunSeq: 5 });
      const updated = workers.get("w1");
      expect(updated?.latestRunSeq).toBe(5);
      expect(updated?.sessionRef).toBe("fleet-w1");
    });

    it("放行后可以更新实际池和模型拆分字段", () => {
      const { workers } = setup();
      workers.insert(createWorkerRecord({ id: "w1", projectKey: "p1", poolId: null, model: null }));
      workers.update("w1", {
        poolId: "pool-a",
        model: "provider/model",
        channel: "provider",
        modelName: "model",
      });
      expect(workers.get("w1")).toMatchObject({
        poolId: "pool-a",
        model: "provider/model",
        channel: "provider",
        modelName: "model",
      });
    });

    it("sessionRef 显式传 null 可以清空", () => {
      const { workers } = setup();
      workers.insert(createWorkerRecord({ id: "w1", projectKey: "p1", sessionRef: "fleet-w1" }));
      workers.update("w1", { sessionRef: null });
      expect(workers.get("w1")?.sessionRef).toBeNull();
    });
  });

  describe("listByIds", () => {
    it("顺序不保证，但不存在的编号被忽略", () => {
      const { workers } = setup();
      workers.insert(createWorkerRecord({ id: "w1", projectKey: "p1" }));
      workers.insert(createWorkerRecord({ id: "w2", projectKey: "p1" }));
      const result = workers.listByIds(["w1", "missing", "w2"]);
      expect(result.map((worker) => worker.id).sort()).toEqual(["w1", "w2"]);
    });

    it("超过 500 个编号仍正确（触发分批）", () => {
      const { workers } = setup();
      const ids: string[] = [];
      for (let i = 0; i < 501; i += 1) {
        const id = `w${String(i).padStart(5, "0")}`;
        ids.push(id);
        workers.insert(createWorkerRecord({ id, projectKey: "p1" }));
      }
      const result = workers.listByIds([...ids, "missing-one"]);
      expect(result).toHaveLength(501);
      expect(new Set(result.map((worker) => worker.id))).toEqual(new Set(ids));
    });
  });

  describe("listRecent", () => {
    it("不带 projectKey：按创建时间倒序，受 limit 限制", () => {
      const { db, workers } = setup();
      createProjectRepo(db).insert(createProjectRecord({ key: "p2" }));
      workers.insert(
        createWorkerRecord({ id: "w1", projectKey: "p1", createdAt: "2026-01-01T00:00:00.000Z" }),
      );
      workers.insert(
        createWorkerRecord({ id: "w2", projectKey: "p2", createdAt: "2026-01-03T00:00:00.000Z" }),
      );
      workers.insert(
        createWorkerRecord({ id: "w3", projectKey: "p1", createdAt: "2026-01-02T00:00:00.000Z" }),
      );
      expect(workers.listRecent(2).map((worker) => worker.id)).toEqual(["w2", "w3"]);
    });

    it("带 projectKey：只看该项目，按创建时间倒序", () => {
      const { db, workers } = setup();
      createProjectRepo(db).insert(createProjectRecord({ key: "p2" }));
      workers.insert(
        createWorkerRecord({ id: "w1", projectKey: "p1", createdAt: "2026-01-01T00:00:00.000Z" }),
      );
      workers.insert(
        createWorkerRecord({ id: "w2", projectKey: "p2", createdAt: "2026-01-02T00:00:00.000Z" }),
      );
      workers.insert(
        createWorkerRecord({ id: "w3", projectKey: "p1", createdAt: "2026-01-03T00:00:00.000Z" }),
      );
      expect(workers.listRecent(10, "p1").map((worker) => worker.id)).toEqual(["w3", "w1"]);
    });
  });

  describe("deleteMany", () => {
    it("删除苦工连带删除它的全部运行（级联）", () => {
      const { db, workers } = setup();
      const runs = createRunRepo(db);
      workers.insert(createWorkerRecord({ id: "w1", projectKey: "p1" }));
      workers.insert(createWorkerRecord({ id: "w2", projectKey: "p1" }));
      runs.insert(createRunRecord({ id: "w1.1", workerId: "w1", seq: 1 }));
      runs.insert(createRunRecord({ id: "w2.1", workerId: "w2", seq: 1 }));

      workers.deleteMany(["w1"]);

      expect(workers.get("w1")).toBeNull();
      expect(workers.get("w2")).not.toBeNull();
      expect(runs.listByWorker("w1")).toEqual([]);
      expect(runs.listByWorker("w2")).toHaveLength(1);
    });

    it("空数组是无操作", () => {
      const { workers } = setup();
      workers.insert(createWorkerRecord({ id: "w1", projectKey: "p1" }));
      expect(() => workers.deleteMany([])).not.toThrow();
      expect(workers.get("w1")).not.toBeNull();
    });
  });

  it("损坏记录：runtime 不是合法值时读出抛中文错误", () => {
    const { db, workers } = setup();
    db.exec(
      `INSERT INTO workers
         (id, project_key, cwd, title, role, runtime, pool_id, model, thinking, session_ref, created_at, latest_run_seq)
       VALUES ('w1', 'p1', 'cwd', 't', 'role', 'bogus', 'pool', 'model', NULL, NULL, '2026-01-01T00:00:00.000Z', 1);`,
    );
    expect.assertions(3);
    try {
      workers.get("w1");
    } catch (error) {
      expect(isFleetError(error)).toBe(true);
      if (isFleetError(error)) {
        expect(error.code).toBe("internal");
        expect(error.message).toBe("数据库记录损坏：workers.runtime = bogus");
      }
    }
  });

  it("损坏记录：thinking 不是合法档位时读出抛中文错误", () => {
    const { db, workers } = setup();
    db.exec(
      `INSERT INTO workers
         (id, project_key, cwd, title, role, runtime, pool_id, model, thinking, session_ref, created_at, latest_run_seq)
       VALUES ('w1', 'p1', 'cwd', 't', 'role', 'pi', 'pool', 'model', 'ultra', NULL, '2026-01-01T00:00:00.000Z', 1);`,
    );
    expect.assertions(3);
    try {
      workers.get("w1");
    } catch (error) {
      expect(isFleetError(error)).toBe(true);
      if (isFleetError(error)) {
        expect(error.code).toBe("internal");
        expect(error.message).toBe("数据库记录损坏：workers.thinking = ultra");
      }
    }
  });
});
