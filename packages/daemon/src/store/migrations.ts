import type { DatabaseSync } from "node:sqlite";
import { FleetError } from "@fleet/core";

/**
 * 按版本排列的建表语句：下标 0 是版本 1（跑完后 PRAGMA user_version 从 0 变成 1）。
 * 以后加字段或加表，在数组末尾追加新一项，不要改已有的项——已经上线的库要能顺着往后升级。
 */
interface Migration {
  sql: string;
  rebuildsTables?: boolean;
}

const MIGRATIONS: readonly Migration[] = [
  {
    sql: `
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
  },
  // 版本 2（2026-09-24）：运行拿到进程号的时刻，核对进程号有没有被系统复用要用到
  // （见 docs/模块设计/服务层-进程托管.md 3.5）。旧库升级后已有的运行这一列是 null。
  {
    sql: `
  ALTER TABLE runs ADD COLUMN spawned_at TEXT;
  `,
  },
  {
    rebuildsTables: true,
    sql: `
    CREATE TABLE workers_new (
      id TEXT PRIMARY KEY,
      project_key TEXT NOT NULL REFERENCES projects(key) ON DELETE CASCADE,
      cwd TEXT NOT NULL,
      title TEXT NOT NULL,
      role TEXT NOT NULL,
      runtime TEXT NOT NULL,
      pool_id TEXT,
      model TEXT,
      thinking TEXT,
      session_ref TEXT,
      created_at TEXT NOT NULL,
      latest_run_seq INTEGER NOT NULL,
      requested_pool TEXT,
      channel TEXT,
      model_name TEXT
    );
    INSERT INTO workers_new (
      id, project_key, cwd, title, role, runtime, pool_id, model, thinking, session_ref,
      created_at, latest_run_seq, requested_pool, channel, model_name
    )
    SELECT
      id, project_key, cwd, title, role, runtime, pool_id, model, thinking, session_ref,
      created_at, latest_run_seq, NULL,
      CASE WHEN instr(model, '/') > 0
        THEN substr(model, 1, instr(model, '/') - 1)
        ELSE pool_id
      END,
      CASE WHEN instr(model, '/') > 0
        THEN substr(model, instr(model, '/') + 1)
        ELSE model
      END
    FROM workers;
    DROP TABLE workers;
    ALTER TABLE workers_new RENAME TO workers;
    CREATE INDEX idx_workers_project ON workers(project_key, created_at);
    CREATE INDEX idx_workers_created ON workers(created_at);
    CREATE INDEX idx_workers_pool ON workers(pool_id);
    CREATE INDEX idx_workers_role ON workers(role);

    CREATE TABLE runs_new (
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
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL,
      run_ms INTEGER,
      raw_purged INTEGER NOT NULL DEFAULT 0,
      retry_json TEXT,
      activity TEXT,
      last_activity_at TEXT,
      final_text TEXT,
      event_count INTEGER NOT NULL DEFAULT 0,
      spawned_at TEXT,
      UNIQUE (worker_id, seq)
    );
    INSERT INTO runs_new (
      id, worker_id, seq, prompt, status, fail_reason, error_message, queued_at, started_at,
      ended_at, timeout_ms, queue_timeout_ms, pid, process_image, exit_code, killed_by,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, cost_usd,
      run_ms, raw_purged, retry_json, activity, last_activity_at, final_text, event_count,
      spawned_at
    )
    SELECT
      id, worker_id, seq, prompt, status, fail_reason, error_message, queued_at, started_at,
      ended_at, timeout_ms, queue_timeout_ms, pid, process_image, exit_code, killed_by,
      CASE WHEN json_valid(usage_json)
        THEN COALESCE(json_extract(usage_json, '$.inputTokens'), 0) ELSE 0 END,
      CASE WHEN json_valid(usage_json)
        THEN COALESCE(json_extract(usage_json, '$.outputTokens'), 0) ELSE 0 END,
      CASE WHEN json_valid(usage_json)
        THEN COALESCE(json_extract(usage_json, '$.cacheReadTokens'), 0) ELSE 0 END,
      CASE WHEN json_valid(usage_json)
        THEN COALESCE(json_extract(usage_json, '$.cacheWriteTokens'), 0) ELSE 0 END,
      CASE WHEN json_valid(usage_json)
        THEN COALESCE(json_extract(usage_json, '$.totalTokens'), 0) ELSE 0 END,
      CASE WHEN json_valid(usage_json)
        THEN json_extract(usage_json, '$.costUsd') ELSE NULL END,
      CASE WHEN started_at IS NOT NULL AND ended_at IS NOT NULL
        THEN CAST(ROUND((julianday(ended_at) - julianday(started_at)) * 86400000) AS INTEGER)
        ELSE NULL
      END,
      0, retry_json, activity, last_activity_at, final_text, event_count, spawned_at
    FROM runs;
    DROP TABLE runs;
    ALTER TABLE runs_new RENAME TO runs;
    CREATE INDEX idx_runs_status ON runs(status);
    CREATE INDEX idx_runs_ended ON runs(ended_at);
    CREATE INDEX idx_runs_started ON runs(started_at);
    CREATE INDEX idx_runs_raw_purge ON runs(raw_purged, ended_at);

    CREATE TABLE series_colors (
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      color_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (kind, name)
    );
    `,
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.length;

/**
 * 读出当前的 PRAGMA user_version，把之后没跑过的迁移依次执行，每个版本单独一个事务：
 * 一个版本里的语句要么全上，要么迁移失败时全部回滚，不会停在半上不上的中间状态。
 */
export function runMigrations(db: DatabaseSync): void {
  migrateFromVersion(db, readUserVersion(db));
}

/**
 * 从调用方读到的版本开始升级。knownVersion 允许是过期的版本号：每一版都先
 * BEGIN IMMEDIATE 拿写锁，拿到锁之后重新读 user_version，已经不低于目标版本就直接提交跳过。
 * 两个进程同时打开旧库时，慢的一方会排队等锁，等到的库可能已经被别的进程迁完了，
 * 这时不重读版本就会照着过期版本重复迁移。单独导出这个函数是为了让测试能传过期版本模拟竞争。
 */
export function migrateFromVersion(db: DatabaseSync, knownVersion: number): void {
  let version = knownVersion;
  while (version < MIGRATIONS.length) {
    const migration = MIGRATIONS[version];
    if (migration === undefined) {
      throw new FleetError("internal", `迁移脚本缺失：版本 ${version + 1}`);
    }
    let transactionStarted = false;
    try {
      if (migration.rebuildsTables === true) {
        db.exec("PRAGMA foreign_keys = OFF;");
      }
      // 用 BEGIN IMMEDIATE 而不是 BEGIN：先拿到写锁，再去读版本、动手迁移。
      db.exec("BEGIN IMMEDIATE;");
      transactionStarted = true;
      const lockedVersion = readUserVersion(db);
      if (lockedVersion >= version + 1) {
        // 别的连接已经跑过这一版（或更靠后的版本），空事务提交，跳过。
        db.exec("COMMIT;");
        transactionStarted = false;
        version = lockedVersion;
        continue;
      }
      db.exec(migration.sql);
      if (migration.rebuildsTables === true) {
        const violations = db.prepare("PRAGMA foreign_key_check;").all();
        if (violations.length > 0) {
          throw new FleetError("internal", "数据库迁移后外键检查失败");
        }
      }
      // user_version 只接受字面量整数，不支持参数绑定；这里的整数是内部计数器算出来的，不是外部输入。
      db.exec(`PRAGMA user_version = ${version + 1};`);
      db.exec("COMMIT;");
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) {
        db.exec("ROLLBACK;");
      }
      throw error;
    } finally {
      if (migration.rebuildsTables === true) {
        db.exec("PRAGMA foreign_keys = ON;");
      }
    }
    version += 1;
  }
}

export function readUserVersion(db: DatabaseSync): number {
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
