import type { DatabaseSync } from "node:sqlite";
import { isFleetError, ZERO_USAGE } from "@fleet/core";
import { describe, expect, it } from "vitest";
import {
  createProjectRepo,
  createRunRepo,
  createWorkerRepo,
  openDatabase,
} from "../../src/store/index.js";
import { createProjectRecord, createWorkerRecord } from "./factories.js";

/** 每个用例独立开一个内存库，插好一个项目和一个苦工 w1 当外键落脚点。 */
function setup(): { db: DatabaseSync; runs: ReturnType<typeof createRunRepo> } {
  const db = openDatabase(":memory:");
  createProjectRepo(db).insert(createProjectRecord({ key: "p1" }));
  createWorkerRepo(db).insert(createWorkerRecord({ id: "w1", projectKey: "p1" }));
  return { db, runs: createRunRepo(db) };
}

/** 手工插入一行只满足 NOT NULL 约束的运行记录，用于构造损坏数据；worker 必须已存在。 */
function insertRawRun(
  db: DatabaseSync,
  row: {
    id: string;
    workerId: string;
    seq: number;
    status: string;
    queuedAt: string;
    usageJson: string;
    retryJson: string | null;
    failReason?: string | null;
    killedBy?: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO runs (id, worker_id, seq, prompt, status, fail_reason, queued_at, timeout_ms, usage_json, retry_json, killed_by, event_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
  ).run(
    row.id,
    row.workerId,
    row.seq,
    "任务",
    row.status,
    row.failReason ?? null,
    row.queuedAt,
    60_000,
    row.usageJson,
    row.retryJson,
    row.killedBy ?? null,
    0,
  );
}

describe("runRepo：损坏记录", () => {
  it("status 不是合法值时读出抛中文错误", () => {
    const { db, runs } = setup();
    insertRawRun(db, {
      id: "w1.1",
      workerId: "w1",
      seq: 1,
      status: "bogus",
      queuedAt: "2026-01-01T00:00:00.000Z",
      usageJson: JSON.stringify(ZERO_USAGE),
      retryJson: null,
    });
    expect.assertions(3);
    try {
      runs.get("w1.1");
    } catch (error) {
      expect(isFleetError(error)).toBe(true);
      if (isFleetError(error)) {
        expect(error.code).toBe("internal");
        expect(error.message).toBe("数据库记录损坏：runs.status = bogus");
      }
    }
  });

  it("fail_reason 不是合法值时读出抛中文错误", () => {
    const { db, runs } = setup();
    insertRawRun(db, {
      id: "w1.1",
      workerId: "w1",
      seq: 1,
      status: "failed",
      queuedAt: "2026-01-01T00:00:00.000Z",
      usageJson: JSON.stringify(ZERO_USAGE),
      retryJson: null,
      failReason: "bogus",
    });
    expect.assertions(3);
    try {
      runs.get("w1.1");
    } catch (error) {
      expect(isFleetError(error)).toBe(true);
      if (isFleetError(error)) {
        expect(error.code).toBe("internal");
        expect(error.message).toBe("数据库记录损坏：runs.fail_reason = bogus");
      }
    }
  });

  it("killed_by 不是合法值时读出抛中文错误", () => {
    const { db, runs } = setup();
    insertRawRun(db, {
      id: "w1.1",
      workerId: "w1",
      seq: 1,
      status: "cancelled",
      queuedAt: "2026-01-01T00:00:00.000Z",
      usageJson: JSON.stringify(ZERO_USAGE),
      retryJson: null,
      killedBy: "bogus",
    });
    expect.assertions(3);
    try {
      runs.get("w1.1");
    } catch (error) {
      expect(isFleetError(error)).toBe(true);
      if (isFleetError(error)) {
        expect(error.code).toBe("internal");
        expect(error.message).toBe("数据库记录损坏：runs.killed_by = bogus");
      }
    }
  });

  it("usage_json 不是合法 JSON 时读出抛中文错误", () => {
    const { db, runs } = setup();
    insertRawRun(db, {
      id: "w1.1",
      workerId: "w1",
      seq: 1,
      status: "queued",
      queuedAt: "2026-01-01T00:00:00.000Z",
      usageJson: "not-json",
      retryJson: null,
    });
    expect.assertions(3);
    try {
      runs.get("w1.1");
    } catch (error) {
      expect(isFleetError(error)).toBe(true);
      if (isFleetError(error)) {
        expect(error.code).toBe("internal");
        expect(error.message).toBe("数据库记录损坏：runs.usage_json = not-json");
      }
    }
  });

  it("usage_json 字段类型不对时读出抛中文错误", () => {
    const { db, runs } = setup();
    const badJson = '{"inputTokens":"not-a-number"}';
    insertRawRun(db, {
      id: "w1.1",
      workerId: "w1",
      seq: 1,
      status: "queued",
      queuedAt: "2026-01-01T00:00:00.000Z",
      usageJson: badJson,
      retryJson: null,
    });
    expect.assertions(3);
    try {
      runs.get("w1.1");
    } catch (error) {
      expect(isFleetError(error)).toBe(true);
      if (isFleetError(error)) {
        expect(error.code).toBe("internal");
        expect(error.message).toBe(`数据库记录损坏：runs.usage_json = ${badJson}`);
      }
    }
  });

  it("retry_json 字段类型不对时读出抛中文错误", () => {
    const { db, runs } = setup();
    const badJson = '{"attempt":"x","max":3,"message":"m"}';
    insertRawRun(db, {
      id: "w1.1",
      workerId: "w1",
      seq: 1,
      status: "queued",
      queuedAt: "2026-01-01T00:00:00.000Z",
      usageJson: JSON.stringify(ZERO_USAGE),
      retryJson: badJson,
    });
    expect.assertions(3);
    try {
      runs.get("w1.1");
    } catch (error) {
      expect(isFleetError(error)).toBe(true);
      if (isFleetError(error)) {
        expect(error.code).toBe("internal");
        expect(error.message).toBe(`数据库记录损坏：runs.retry_json = ${badJson}`);
      }
    }
  });
});
