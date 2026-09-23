import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../../src/store/index.js";
import { createTempDbPath } from "./tempDb.js";

/**
 * 版本 1 的建表语句原文（故意手写一份、不从 migrations.ts 里导出复用）：
 * 用来手工造一个「只跑过版本 1」的文件库，验证升级到版本 2 时旧数据不丢、新列为 null。
 */
const VERSION_1_SQL = `
  CREATE TABLE projects (
    key TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    color_index INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE workers (
    id TEXT PRIMARY KEY,
    project_key TEXT NOT NULL REFERENCES projects(key) ON DELETE CASCADE,
    cwd TEXT NOT NULL,
    title TEXT NOT NULL,
    role TEXT NOT NULL,
    runtime TEXT NOT NULL,
    pool_id TEXT NOT NULL,
    model TEXT NOT NULL,
    thinking TEXT,
    session_ref TEXT,
    created_at TEXT NOT NULL,
    latest_run_seq INTEGER NOT NULL
  );
  CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    fail_reason TEXT,
    error_message TEXT,
    queued_at TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    timeout_ms INTEGER NOT NULL,
    queue_timeout_ms INTEGER,
    pid INTEGER,
    process_image TEXT,
    exit_code INTEGER,
    killed_by TEXT,
    usage_json TEXT NOT NULL,
    retry_json TEXT,
    activity TEXT,
    last_activity_at TEXT,
    final_text TEXT,
    event_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE (worker_id, seq)
  );
`;

/** 手工造一个只跑过版本 1 的文件库：建好表、写一条运行、user_version 停在 1。 */
function seedVersion1Database(dbPath: string): void {
  const db = new DatabaseSync(dbPath);
  db.exec(VERSION_1_SQL);
  db.exec("PRAGMA user_version = 1;");
  db.prepare(
    "INSERT INTO projects (key, path, name, color_index, created_at) VALUES (?, ?, ?, ?, ?);",
  ).run("c:\\code\\old", "C:\\code\\old", "old", 0, "2026-01-01T00:00:00.000Z");
  db.prepare(
    `INSERT INTO workers
       (id, project_key, cwd, title, role, runtime, pool_id, model, thinking, session_ref, created_at, latest_run_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
  ).run(
    "wold0001",
    "c:\\code\\old",
    "C:\\code\\old",
    "旧任务",
    "worker",
    "pi",
    "dsf",
    "mcgrox/deepseek-v4.1-flash",
    null,
    "fleet-wold0001",
    "2026-01-01T00:00:00.000Z",
    1,
  );
  db.prepare(
    `INSERT INTO runs (
       id, worker_id, seq, prompt, status, fail_reason, error_message,
       queued_at, started_at, ended_at, timeout_ms, queue_timeout_ms,
       pid, process_image, exit_code, killed_by, usage_json, retry_json,
       activity, last_activity_at, final_text, event_count
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
  ).run(
    "wold0001.1",
    "wold0001",
    1,
    "升级前派的活",
    "running",
    null,
    null,
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:01.000Z",
    null,
    1_800_000,
    null,
    4321,
    "node.exe",
    null,
    null,
    '{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"cacheWriteTokens":0,"totalTokens":0,"costUsd":null}',
    null,
    null,
    null,
    null,
    0,
  );
  db.close();
}

describe("openDatabase / 迁移", () => {
  it(":memory: 新库建表后 PRAGMA user_version 变成 2", () => {
    const db = openDatabase(":memory:");
    expect(db.prepare("PRAGMA user_version;").get()).toEqual({ user_version: 2 });
    db.close();
  });

  it("三张表都建好了，能直接查询，runs 表已经有 spawned_at 列", () => {
    const db = openDatabase(":memory:");
    expect(() => db.prepare("SELECT * FROM projects;").all()).not.toThrow();
    expect(() => db.prepare("SELECT * FROM workers;").all()).not.toThrow();
    expect(() => db.prepare("SELECT spawned_at FROM runs;").all()).not.toThrow();
    db.close();
  });

  it("文件数据库：父目录不存在时先建好", () => {
    const { dbPath, cleanup } = createTempDbPath();
    try {
      const nestedPath = join(dbPath, "..", "nested", "fleet.db");
      const db = openDatabase(nestedPath);
      expect(existsSync(nestedPath)).toBe(true);
      db.close();
    } finally {
      cleanup();
    }
  });

  it("文件数据库：再次打开不重复执行迁移", () => {
    const { dbPath, cleanup } = createTempDbPath();
    try {
      const first = openDatabase(dbPath);
      first.close();

      const second = openDatabase(dbPath);
      expect(second.prepare("PRAGMA user_version;").get()).toEqual({ user_version: 2 });
      second.close();
    } finally {
      cleanup();
    }
  });

  it("文件数据库开启 WAL 模式", () => {
    const { dbPath, cleanup } = createTempDbPath();
    try {
      const db = openDatabase(dbPath);
      expect(db.prepare("PRAGMA journal_mode;").get()).toEqual({ journal_mode: "wal" });
      db.close();
    } finally {
      cleanup();
    }
  });

  it("只跑过版本 1 的旧库重新打开后升到版本 2，原有数据不丢，新列为 null", () => {
    const { dbPath, cleanup } = createTempDbPath();
    try {
      seedVersion1Database(dbPath);

      const db = openDatabase(dbPath);
      expect(db.prepare("PRAGMA user_version;").get()).toEqual({ user_version: 2 });

      const project = db.prepare("SELECT * FROM projects WHERE key = ?;").get("c:\\code\\old");
      expect(project).toMatchObject({ name: "old" });

      const run = db.prepare("SELECT * FROM runs WHERE id = ?;").get("wold0001.1");
      expect(run).toMatchObject({ prompt: "升级前派的活", pid: 4321, spawned_at: null });
      db.close();
    } finally {
      cleanup();
    }
  });
});
