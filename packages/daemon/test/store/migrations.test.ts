import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../../src/store/index.js";
import { createTempDbPath } from "./tempDb.js";

describe("openDatabase / 迁移", () => {
  it(":memory: 新库建表后 PRAGMA user_version 变成 1", () => {
    const db = openDatabase(":memory:");
    expect(db.prepare("PRAGMA user_version;").get()).toEqual({ user_version: 1 });
    db.close();
  });

  it("三张表都建好了，能直接查询", () => {
    const db = openDatabase(":memory:");
    expect(() => db.prepare("SELECT * FROM projects;").all()).not.toThrow();
    expect(() => db.prepare("SELECT * FROM workers;").all()).not.toThrow();
    expect(() => db.prepare("SELECT * FROM runs;").all()).not.toThrow();
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
      expect(second.prepare("PRAGMA user_version;").get()).toEqual({ user_version: 1 });
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
});
