import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  createProjectRepo,
  createRunRepo,
  createWorkerRepo,
  openDatabase,
} from "../../src/store/index.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./factories.js";

/** 每个用例独立开一个内存库，插好一个项目和一个苦工 w1 当外键落脚点。 */
function setup(): { db: DatabaseSync; runs: ReturnType<typeof createRunRepo> } {
  const db = openDatabase(":memory:");
  createProjectRepo(db).insert(createProjectRecord({ key: "p1" }));
  createWorkerRepo(db).insert(createWorkerRecord({ id: "w1", projectKey: "p1" }));
  return { db, runs: createRunRepo(db) };
}

describe("runRepo：按苦工 / 时间窗口 / 过期查询", () => {
  it("listByWorker：按序号升序", () => {
    const { runs } = setup();
    runs.insert(createRunRecord({ id: "w1.2", workerId: "w1", seq: 2 }));
    runs.insert(createRunRecord({ id: "w1.1", workerId: "w1", seq: 1 }));
    runs.insert(createRunRecord({ id: "w1.3", workerId: "w1", seq: 3 }));
    expect(runs.listByWorker("w1").map((run) => run.seq)).toEqual([1, 2, 3]);
  });

  it("listByWorkers：超过 500 个苦工编号仍正确，且按苦工编号、序号升序", () => {
    const db = openDatabase(":memory:");
    createProjectRepo(db).insert(createProjectRecord({ key: "p1" }));
    const workers = createWorkerRepo(db);
    const runs = createRunRepo(db);
    for (const id of ["w-real-1", "w-real-2", "w-real-3"]) {
      workers.insert(createWorkerRecord({ id, projectKey: "p1" }));
      runs.insert(createRunRecord({ id: `${id}.2`, workerId: id, seq: 2 }));
      runs.insert(createRunRecord({ id: `${id}.1`, workerId: id, seq: 1 }));
    }

    // 故意把真实编号插在两个批次中间，避免批次边界恰好和排序边界对齐掩盖 bug。
    const fakeIds = Array.from({ length: 600 }, (_, i) => `fake-${String(i).padStart(4, "0")}`);
    const ids = [
      "w-real-2",
      ...fakeIds.slice(0, 300),
      "w-real-1",
      ...fakeIds.slice(300),
      "w-real-3",
    ];
    expect(ids.length).toBeGreaterThan(500);

    const result = runs.listByWorkers(ids);
    expect(result.map((run) => run.id)).toEqual([
      "w-real-1.1",
      "w-real-1.2",
      "w-real-2.1",
      "w-real-2.2",
      "w-real-3.1",
      "w-real-3.2",
    ]);
  });

  it("listActive：只含排队中和工作中，按排队时间升序", () => {
    const { runs } = setup();
    runs.insert(
      createRunRecord({
        id: "w1.1",
        workerId: "w1",
        seq: 1,
        status: "running",
        queuedAt: "2026-01-01T00:03:00.000Z",
      }),
    );
    runs.insert(
      createRunRecord({
        id: "w1.2",
        workerId: "w1",
        seq: 2,
        status: "completed",
        queuedAt: "2026-01-01T00:01:00.000Z",
      }),
    );
    runs.insert(
      createRunRecord({
        id: "w1.3",
        workerId: "w1",
        seq: 3,
        status: "queued",
        queuedAt: "2026-01-01T00:01:00.000Z",
      }),
    );
    runs.insert(
      createRunRecord({
        id: "w1.4",
        workerId: "w1",
        seq: 4,
        status: "failed",
        queuedAt: "2026-01-01T00:00:30.000Z",
      }),
    );
    runs.insert(
      createRunRecord({
        id: "w1.5",
        workerId: "w1",
        seq: 5,
        status: "queued",
        queuedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    expect(runs.listActive().map((run) => run.id)).toEqual(["w1.5", "w1.3", "w1.1"]);
  });

  it("listEndedSince：结束时间不早于 since，按结束时间升序", () => {
    const { runs } = setup();
    runs.insert(
      createRunRecord({ id: "w1.1", workerId: "w1", seq: 1, status: "queued", endedAt: null }),
    );
    runs.insert(
      createRunRecord({
        id: "w1.2",
        workerId: "w1",
        seq: 2,
        status: "completed",
        endedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    runs.insert(
      createRunRecord({
        id: "w1.3",
        workerId: "w1",
        seq: 3,
        status: "completed",
        endedAt: "2026-01-03T00:00:00.000Z",
      }),
    );
    runs.insert(
      createRunRecord({
        id: "w1.4",
        workerId: "w1",
        seq: 4,
        status: "completed",
        endedAt: "2026-01-02T00:00:00.000Z",
      }),
    );

    const result = runs.listEndedSince("2026-01-02T00:00:00.000Z");
    expect(result.map((run) => run.id)).toEqual(["w1.4", "w1.3"]);
  });

  it("listStartedSince：开跑时间不早于 since，按开跑时间升序", () => {
    const { runs } = setup();
    runs.insert(
      createRunRecord({ id: "w1.1", workerId: "w1", seq: 1, status: "queued", startedAt: null }),
    );
    runs.insert(
      createRunRecord({
        id: "w1.2",
        workerId: "w1",
        seq: 2,
        status: "running",
        startedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    runs.insert(
      createRunRecord({
        id: "w1.3",
        workerId: "w1",
        seq: 3,
        status: "running",
        startedAt: "2026-01-03T00:00:00.000Z",
      }),
    );
    runs.insert(
      createRunRecord({
        id: "w1.4",
        workerId: "w1",
        seq: 4,
        status: "running",
        startedAt: "2026-01-02T00:00:00.000Z",
      }),
    );

    const result = runs.listStartedSince("2026-01-02T00:00:00.000Z");
    expect(result.map((run) => run.id)).toEqual(["w1.4", "w1.3"]);
  });

  it("listExpiredWorkerIds：只看每个苦工最新一次运行", () => {
    const db = openDatabase(":memory:");
    createProjectRepo(db).insert(createProjectRecord({ key: "p1" }));
    const workers = createWorkerRepo(db);
    const runs = createRunRepo(db);
    const before = "2026-03-01T00:00:00.000Z";

    // w1：最新一次（seq2）还在排队中，尽管更早的一次（seq1）已经是过期很久的终态。
    workers.insert(createWorkerRecord({ id: "w1", projectKey: "p1", latestRunSeq: 2 }));
    runs.insert(
      createRunRecord({
        id: "w1.1",
        workerId: "w1",
        seq: 1,
        status: "failed",
        endedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    runs.insert(
      createRunRecord({ id: "w1.2", workerId: "w1", seq: 2, status: "queued", endedAt: null }),
    );

    // w2：最新一次已完成，且结束时间早于 before —— 应该判定过期。
    workers.insert(createWorkerRecord({ id: "w2", projectKey: "p1", latestRunSeq: 1 }));
    runs.insert(
      createRunRecord({
        id: "w2.1",
        workerId: "w2",
        seq: 1,
        status: "completed",
        endedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    // w3：最新一次已完成，但结束时间晚于 before —— 还不该清理。
    workers.insert(createWorkerRecord({ id: "w3", projectKey: "p1", latestRunSeq: 1 }));
    runs.insert(
      createRunRecord({
        id: "w3.1",
        workerId: "w3",
        seq: 1,
        status: "completed",
        endedAt: "2026-05-01T00:00:00.000Z",
      }),
    );

    // w4：最新一次还在工作中，不是终态。
    workers.insert(createWorkerRecord({ id: "w4", projectKey: "p1", latestRunSeq: 1 }));
    runs.insert(
      createRunRecord({ id: "w4.1", workerId: "w4", seq: 1, status: "running", endedAt: null }),
    );

    expect(runs.listExpiredWorkerIds(before)).toEqual(["w2"]);
  });
});
