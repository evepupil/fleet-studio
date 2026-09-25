import { DatabaseSync } from "node:sqlite";

export const VERSION_2_SQL = `
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
  CREATE INDEX idx_workers_project ON workers(project_key, created_at);
  CREATE INDEX idx_workers_created ON workers(created_at);
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
    spawned_at TEXT,
    UNIQUE (worker_id, seq)
  );
  CREATE INDEX idx_runs_status ON runs(status);
  CREATE INDEX idx_runs_ended ON runs(ended_at);
  CREATE INDEX idx_runs_started ON runs(started_at);
`;

interface SeedOptions {
  malformedUsage?: boolean;
  orphanWorker?: boolean;
}

export function seedVersion2Database(dbPath: string, options: SeedOptions = {}): void {
  const db = new DatabaseSync(dbPath);
  db.exec(VERSION_2_SQL);
  db.exec("PRAGMA user_version = 2;");
  db.prepare(
    "INSERT INTO projects (key, path, name, color_index, created_at) VALUES (?, ?, ?, ?, ?);",
  ).run("p1", "C:/work/project", "project", 0, "2026-01-01T00:00:00.000Z");

  const insertWorker = db.prepare(
    `INSERT INTO workers
      (id, project_key, cwd, title, role, runtime, pool_id, model, thinking, session_ref,
       created_at, latest_run_seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
  );
  insertWorker.run(
    "w-slash",
    "p1",
    "C:/work/project",
    "旧模型任务",
    "worker",
    "pi",
    "pool-a",
    "provider/model-v1",
    null,
    null,
    "2026-01-01T00:00:00.000Z",
    1,
  );
  insertWorker.run(
    "w-plain",
    "p1",
    "C:/work/project",
    "旧默认任务",
    "reviewer",
    "opencode",
    "pool-b",
    "plain-model",
    null,
    null,
    "2026-01-02T00:00:00.000Z",
    1,
  );

  if (options.orphanWorker === true) {
    db.exec("PRAGMA foreign_keys = OFF;");
    insertWorker.run(
      "w-orphan",
      "missing-project",
      "C:/missing",
      "orphan",
      "worker",
      "pi",
      "pool-a",
      "provider/model",
      null,
      null,
      "2026-01-03T00:00:00.000Z",
      1,
    );
  }

  const insertRun = db.prepare(
    `INSERT INTO runs (
       id, worker_id, seq, prompt, status, queued_at, started_at, ended_at, timeout_ms,
       usage_json, spawned_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
  );
  insertRun.run(
    "w-slash.1",
    "w-slash",
    1,
    "已有用量",
    "completed",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:01:00.000Z",
    60_000,
    options.malformedUsage === true
      ? "{invalid-json"
      : JSON.stringify({
          inputTokens: 10,
          outputTokens: 20,
          cacheReadTokens: 3,
          cacheWriteTokens: 4,
          totalTokens: 37,
          costUsd: 0.125,
        }),
    "2026-01-01T00:00:00.100Z",
  );
  insertRun.run(
    "w-plain.1",
    "w-plain",
    1,
    "没有结束时间",
    "running",
    "2026-01-02T00:00:00.000Z",
    "2026-01-02T00:00:01.000Z",
    null,
    60_000,
    JSON.stringify({ inputTokens: 2, outputTokens: 0, totalTokens: 2, costUsd: null }),
    null,
  );
  db.close();
}
