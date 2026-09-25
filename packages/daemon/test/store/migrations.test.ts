import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  migrateFromVersion,
  openDatabase,
  readUserVersion,
  runMigrations,
} from "../../src/store/index.js";
import { seedVersion2Database } from "./legacyDb.js";
import { createTempDbPath } from "./tempDb.js";

describe("openDatabase / 迁移", () => {
  it("新库直接升到版本 3 并建好 M5 表和列", () => {
    const db = openDatabase(":memory:");
    expect(readUserVersion(db)).toBe(3);
    expect(() => db.prepare("SELECT * FROM series_colors;").all()).not.toThrow();
    expect(() =>
      db.prepare(`SELECT requested_pool, channel, model_name FROM workers LIMIT 0;`).all(),
    ).not.toThrow();
    expect(() =>
      db
        .prepare(
          `SELECT input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                total_tokens, cost_usd, run_ms, raw_purged, spawned_at FROM runs LIMIT 0;`,
        )
        .all(),
    ).not.toThrow();
    expect(db.prepare("PRAGMA foreign_keys;").get()).toEqual({ foreign_keys: 1 });
    db.close();
  });

  it("版本 2 数据迁移保留记录、拆分模型字段并从 JSON 搬用量", () => {
    const { dbPath, cleanup } = createTempDbPath();
    try {
      seedVersion2Database(dbPath);
      const db = openDatabase(dbPath);
      expect(readUserVersion(db)).toBe(3);
      expect(db.prepare("PRAGMA foreign_key_check;").all()).toEqual([]);

      expect(db.prepare("SELECT * FROM workers WHERE id = ?;").get("w-slash")).toMatchObject({
        requested_pool: null,
        pool_id: "pool-a",
        model: "provider/model-v1",
        channel: "provider",
        model_name: "model-v1",
      });
      expect(db.prepare("SELECT * FROM workers WHERE id = ?;").get("w-plain")).toMatchObject({
        channel: "pool-b",
        model_name: "plain-model",
      });
      expect(db.prepare("SELECT * FROM runs WHERE id = ?;").get("w-slash.1")).toMatchObject({
        input_tokens: 10,
        output_tokens: 20,
        cache_read_tokens: 3,
        cache_write_tokens: 4,
        total_tokens: 37,
        cost_usd: 0.125,
        run_ms: 60_000,
        raw_purged: 0,
        spawned_at: "2026-01-01T00:00:00.100Z",
      });
      expect(db.prepare("SELECT * FROM runs WHERE id = ?;").get("w-plain.1")).toMatchObject({
        input_tokens: 2,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        total_tokens: 2,
        cost_usd: null,
        run_ms: null,
      });
      db.close();
    } finally {
      cleanup();
    }
  });

  it("同一个文件库用两个连接先后迁移，拿到过期版本号的第二个连接不重复迁移", () => {
    const { dbPath, cleanup } = createTempDbPath();
    try {
      seedVersion2Database(dbPath);

      const first = new DatabaseSync(dbPath);
      runMigrations(first);
      expect(readUserVersion(first)).toBe(3);
      first.close();

      // 第二个连接是照着「还是版本 2」这个过期印象来的（模拟拿到锁前库已被别人迁完），
      // 重读版本后应该直接跳过，不能拿旧版本号再跑一遍迁移。
      const second = new DatabaseSync(dbPath);
      expect(() => migrateFromVersion(second, 2)).not.toThrow();
      expect(readUserVersion(second)).toBe(3);
      expect(second.prepare("PRAGMA foreign_key_check;").all()).toEqual([]);
      // 数据没被重复迁移弄坏：苦工还是两条，运行还在，模型字段拆分仍然正确。
      expect(second.prepare("SELECT COUNT(*) AS count FROM workers;").get()).toMatchObject({
        count: 2,
      });
      expect(second.prepare("SELECT * FROM runs WHERE id = ?;").get("w-slash.1")).toMatchObject({
        input_tokens: 10,
        total_tokens: 37,
      });
      second.close();
    } finally {
      cleanup();
    }
  });

  it("usage_json 不是合法 JSON 时该行用量归零，其余行正常迁移", () => {
    const { dbPath, cleanup } = createTempDbPath();
    try {
      seedVersion2Database(dbPath, { malformedUsage: true });
      const db = openDatabase(dbPath);
      expect(readUserVersion(db)).toBe(3);
      expect(db.prepare("PRAGMA foreign_key_check;").all()).toEqual([]);

      expect(db.prepare("SELECT * FROM runs WHERE id = ?;").get("w-slash.1")).toMatchObject({
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        total_tokens: 0,
        cost_usd: null,
        run_ms: 60_000,
      });
      expect(db.prepare("SELECT * FROM runs WHERE id = ?;").get("w-plain.1")).toMatchObject({
        input_tokens: 2,
        total_tokens: 2,
      });
      db.close();
    } finally {
      cleanup();
    }
  });

  it("外键检查失败时回滚版本 3，并重新开启外键", () => {
    const { dbPath, cleanup } = createTempDbPath();
    try {
      seedVersion2Database(dbPath, { orphanWorker: true });
      const db = new DatabaseSync(dbPath);
      db.exec("PRAGMA foreign_keys = ON;");
      expect(() => runMigrations(db)).toThrow("数据库迁移后外键检查失败");
      expect(readUserVersion(db)).toBe(2);
      expect(db.prepare("PRAGMA foreign_keys;").get()).toEqual({ foreign_keys: 1 });
      expect(() => db.prepare("SELECT requested_pool FROM workers;").all()).toThrow();
      expect(() => db.prepare("SELECT usage_json FROM runs;").all()).not.toThrow();
      db.close();
    } finally {
      cleanup();
    }
  });

  it("文件数据库父目录不存在时会先创建，并且重复打开不重复迁移", () => {
    const { dbPath, cleanup } = createTempDbPath();
    try {
      const nestedPath = join(dbPath, "..", "nested", "fleet.db");
      const first = openDatabase(nestedPath);
      expect(existsSync(nestedPath)).toBe(true);
      first.close();
      const second = openDatabase(nestedPath);
      expect(readUserVersion(second)).toBe(3);
      second.close();
    } finally {
      cleanup();
    }
  });
});
