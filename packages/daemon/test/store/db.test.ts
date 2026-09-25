import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openDatabase, readUserVersion } from "../../src/store/index.js";
import { seedVersion2Database } from "./legacyDb.js";
import { createTempDbPath } from "./tempDb.js";

describe("openDatabase / 升级备份", () => {
  it("版本 2 文件库迁移前生成可读的旧库备份", () => {
    const { dbPath, cleanup } = createTempDbPath();
    const backupDir = join(dirname(dbPath), "db-backups");
    try {
      seedVersion2Database(dbPath);
      const db = openDatabase(dbPath, backupDir);
      expect(readUserVersion(db)).toBe(3);
      db.close();

      const files = readdirSync(backupDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^fleet-v2-.+\.db$/);
      const backup = new DatabaseSync(join(backupDir, files[0] ?? ""));
      expect(readUserVersion(backup)).toBe(2);
      expect(
        backup.prepare("SELECT usage_json FROM runs WHERE id = ?;").get("w-slash.1"),
      ).toBeDefined();
      backup.close();
    } finally {
      cleanup();
    }
  });

  it("成功备份后只保留文件名排序靠后的 10 份", () => {
    const { dbPath, cleanup } = createTempDbPath();
    const backupDir = join(dirname(dbPath), "db-backups");
    try {
      seedVersion2Database(dbPath);
      mkdirSync(backupDir, { recursive: true });
      for (let index = 0; index < 10; index += 1) {
        const name = `fleet-v1-2000-01-01T00-00-${String(index).padStart(2, "0")}-000Z.db`;
        writeFileSync(join(backupDir, name), "old backup");
      }

      const db = openDatabase(dbPath, backupDir);
      db.close();

      const files = readdirSync(backupDir).sort();
      expect(files).toHaveLength(10);
      expect(files).not.toContain("fleet-v1-2000-01-01T00-00-00-000Z.db");
      expect(files.some((name) => name.startsWith("fleet-v2-"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("旧备份删不掉时（例如被同名目录占住）仍然算备份成功，不拦住启动", () => {
    const { dbPath, cleanup } = createTempDbPath();
    const backupDir = join(dirname(dbPath), "db-backups");
    try {
      seedVersion2Database(dbPath);
      mkdirSync(backupDir, { recursive: true });
      // 最旧的一份用同名目录顶替：unlinkSync 会失败（Windows 上文件被占用是同类情况），
      // 清理阶段必须自己吞掉这个错，不能把它当成备份失败。
      mkdirSync(join(backupDir, "fleet-v1-2000-01-01T00-00-00-000Z.db"));
      for (let index = 1; index <= 10; index += 1) {
        const name = `fleet-v1-2000-01-01T00-00-${String(index).padStart(2, "0")}-000Z.db`;
        writeFileSync(join(backupDir, name), "old backup");
      }

      const db = openDatabase(dbPath, backupDir);
      expect(readUserVersion(db)).toBe(3);
      db.close();

      // 本次备份已经写出来了，删不掉的那份还在（下次升级再清）。
      const files = readdirSync(backupDir);
      expect(files.some((name) => name.startsWith("fleet-v2-"))).toBe(true);
      expect(files).toContain("fleet-v1-2000-01-01T00-00-00-000Z.db");
    } finally {
      cleanup();
    }
  });

  it("新文件库和内存库不备份", () => {
    const { dbPath, cleanup } = createTempDbPath();
    const backupDir = join(dirname(dbPath), "no-backups");
    try {
      const fileDb = openDatabase(dbPath, backupDir);
      fileDb.close();
      const memoryDb = openDatabase(":memory:", backupDir);
      memoryDb.close();
      expect(existsSync(backupDir)).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("备份失败时不运行迁移", () => {
    const { dbPath, cleanup } = createTempDbPath();
    const backupPath = join(dirname(dbPath), "not-a-directory");
    try {
      seedVersion2Database(dbPath);
      writeFileSync(backupPath, "block the backup directory");
      expect(() => openDatabase(dbPath, backupPath)).toThrow("数据库升级前备份失败");
      const oldDb = new DatabaseSync(dbPath);
      expect(readUserVersion(oldDb)).toBe(2);
      expect(() => oldDb.prepare("SELECT usage_json FROM runs;").all()).not.toThrow();
      oldDb.close();
    } finally {
      cleanup();
    }
  });
});
