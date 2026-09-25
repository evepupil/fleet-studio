import type { DatabaseSync } from "node:sqlite";
import { isFleetError } from "@fleet/core";
import { describe, expect, it } from "vitest";
import {
  createProjectRepo,
  createRunRepo,
  createWorkerRepo,
  openDatabase,
} from "../../src/store/index.js";
import { createProjectRecord, createWorkerRecord } from "./factories.js";

function setup(): { db: DatabaseSync; runs: ReturnType<typeof createRunRepo> } {
  const db = openDatabase(":memory:");
  createProjectRepo(db).insert(createProjectRecord({ key: "p1" }));
  createWorkerRepo(db).insert(createWorkerRecord({ id: "w1", projectKey: "p1" }));
  return { db, runs: createRunRepo(db) };
}

function insertRawRun(
  db: DatabaseSync,
  row: {
    id: string;
    workerId: string;
    seq: number;
    status: string;
    queuedAt: string;
    inputTokens?: number | string;
    failReason?: string | null;
    killedBy?: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO runs
       (id, worker_id, seq, prompt, status, fail_reason, queued_at, timeout_ms,
        input_tokens, retry_json, killed_by, event_count)
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
    row.inputTokens ?? 0,
    null,
    row.killedBy ?? null,
    0,
  );
}

function expectInternalError(action: () => unknown, message: string): void {
  expect.assertions(3);
  try {
    action();
  } catch (error) {
    expect(isFleetError(error)).toBe(true);
    if (isFleetError(error)) {
      expect(error.code).toBe("internal");
      expect(error.message).toBe(message);
    }
  }
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
    });
    expectInternalError(() => runs.get("w1.1"), "数据库记录损坏：runs.status = bogus");
  });

  it("fail_reason 不是合法值时读出抛中文错误", () => {
    const { db, runs } = setup();
    insertRawRun(db, {
      id: "w1.1",
      workerId: "w1",
      seq: 1,
      status: "failed",
      queuedAt: "2026-01-01T00:00:00.000Z",
      failReason: "bogus",
    });
    expectInternalError(() => runs.get("w1.1"), "数据库记录损坏：runs.fail_reason = bogus");
  });

  it("killed_by 不是合法值时读出抛中文错误", () => {
    const { db, runs } = setup();
    insertRawRun(db, {
      id: "w1.1",
      workerId: "w1",
      seq: 1,
      status: "cancelled",
      queuedAt: "2026-01-01T00:00:00.000Z",
      killedBy: "bogus",
    });
    expectInternalError(() => runs.get("w1.1"), "数据库记录损坏：runs.killed_by = bogus");
  });

  it("用量列非有限数字或负数时读出抛中文错误", () => {
    const { db, runs } = setup();
    insertRawRun(db, {
      id: "w1.1",
      workerId: "w1",
      seq: 1,
      status: "queued",
      queuedAt: "2026-01-01T00:00:00.000Z",
      inputTokens: "not-a-number",
    });
    expectInternalError(() => runs.get("w1.1"), "数据库记录损坏：runs.input_tokens = not-a-number");
  });

  it("用量列为负数时读出抛中文错误", () => {
    const { db, runs } = setup();
    insertRawRun(db, {
      id: "w1.1",
      workerId: "w1",
      seq: 1,
      status: "queued",
      queuedAt: "2026-01-01T00:00:00.000Z",
      inputTokens: -1,
    });
    expectInternalError(() => runs.get("w1.1"), "数据库记录损坏：runs.input_tokens = -1");
  });

  it("retry_json 字段类型不对时读出抛中文错误", () => {
    const { db, runs } = setup();
    db.prepare(
      `INSERT INTO runs
         (id, worker_id, seq, prompt, status, queued_at, timeout_ms, retry_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    ).run(
      "w1.1",
      "w1",
      1,
      "任务",
      "queued",
      "2026-01-01T00:00:00.000Z",
      60_000,
      '{"attempt":"x","max":3,"message":"m"}',
    );
    expectInternalError(
      () => runs.get("w1.1"),
      '数据库记录损坏：runs.retry_json = {"attempt":"x","max":3,"message":"m"}',
    );
  });
});
