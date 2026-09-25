import { describe, expect, it } from "vitest";
import {
  createProjectRepo,
  createRunRepo,
  createWorkerRepo,
  openDatabase,
} from "../../src/store/index.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./factories.js";

function setup(): ReturnType<typeof createRunRepo> {
  const db = openDatabase(":memory:");
  createProjectRepo(db).insert(createProjectRecord({ key: "p1" }));
  createWorkerRepo(db).insert(createWorkerRecord({ id: "w1", projectKey: "p1" }));
  return createRunRepo(db);
}

describe("runRepo / M5 查询", () => {
  it("listStartedBetween 按含起点、不含终点筛选，from 为 null 时只限制终点", () => {
    const runs = setup();
    runs.insert(createRunRecord({ id: "w1.1", workerId: "w1", seq: 1, startedAt: null }));
    runs.insert(
      createRunRecord({
        id: "w1.2",
        workerId: "w1",
        seq: 2,
        startedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    runs.insert(
      createRunRecord({
        id: "w1.3",
        workerId: "w1",
        seq: 3,
        startedAt: "2026-01-02T00:00:00.000Z",
      }),
    );
    runs.insert(
      createRunRecord({
        id: "w1.4",
        workerId: "w1",
        seq: 4,
        startedAt: "2026-01-03T00:00:00.000Z",
      }),
    );

    expect(
      runs
        .listStartedBetween("2026-01-02T00:00:00.000Z", "2026-01-03T00:00:00.000Z")
        .map((run) => run.id),
    ).toEqual(["w1.3"]);
    expect(runs.listStartedBetween(null, "2026-01-02T00:00:00.000Z").map((run) => run.id)).toEqual([
      "w1.2",
    ]);
  });

  it("清理候选按 ended_at 升序，标记后不再返回", () => {
    const runs = setup();
    runs.insert(
      createRunRecord({
        id: "w1.1",
        workerId: "w1",
        seq: 1,
        endedAt: "2026-01-03T00:00:00.000Z",
      }),
    );
    runs.insert(
      createRunRecord({
        id: "w1.2",
        workerId: "w1",
        seq: 2,
        endedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    runs.insert(
      createRunRecord({
        id: "w1.3",
        workerId: "w1",
        seq: 3,
        endedAt: null,
      }),
    );

    expect(runs.listRawPurgeCandidates("2026-01-04T00:00:00.000Z", 1)).toEqual([{ id: "w1.2" }]);
    runs.markRawPurged(["w1.2"]);
    expect(runs.listRawPurgeCandidates("2026-01-04T00:00:00.000Z", 10)).toEqual([{ id: "w1.1" }]);
  });
});
