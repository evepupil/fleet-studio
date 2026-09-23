import type { DatabaseSync } from "node:sqlite";
import { FleetError } from "@fleet/core";

/**
 * 按版本排列的建表语句：下标 0 是版本 1（跑完后 PRAGMA user_version 从 0 变成 1）。
 * 以后加字段或加表，在数组末尾追加新一项，不要改已有的项——已经上线的库要能顺着往后升级。
 */
const MIGRATIONS: readonly string[] = [
  `
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
    UNIQUE (worker_id, seq)
  );
  CREATE INDEX idx_runs_status ON runs(status);
  CREATE INDEX idx_runs_ended ON runs(ended_at);
  CREATE INDEX idx_runs_started ON runs(started_at);
  `,
];

/**
 * 读出当前的 PRAGMA user_version，把之后没跑过的迁移依次执行，每个版本单独一个事务：
 * 一个版本里的语句要么全上，要么迁移失败时全部回滚，不会停在半上不上的中间状态。
 */
export function runMigrations(db: DatabaseSync): void {
  let version = readUserVersion(db);
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    if (sql === undefined) {
      throw new FleetError("internal", `迁移脚本缺失：版本 ${version + 1}`);
    }
    db.exec("BEGIN;");
    try {
      db.exec(sql);
      // user_version 只接受字面量整数，不支持参数绑定；这里的整数是内部计数器算出来的，不是外部输入。
      db.exec(`PRAGMA user_version = ${version + 1};`);
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
    version += 1;
  }
}

function readUserVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version;").get();
  if (row === undefined) {
    throw new FleetError("internal", "读取 PRAGMA user_version 失败");
  }
  // row 的类型带索引签名，按 tsconfig 的 noPropertyAccessFromIndexSignature 规则只能用方括号取值；
  // 这里接一次没有索引签名的形状，才能用 shape.user_version 而不是 row["user_version"]。
  const shape: { user_version?: unknown } = row;
  const value = shape.user_version;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new FleetError("internal", `PRAGMA user_version 不是整数：${String(value)}`);
  }
  return value;
}
