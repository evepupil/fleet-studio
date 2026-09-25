import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { FleetError } from "@fleet/core";
import { LATEST_SCHEMA_VERSION, readUserVersion, runMigrations } from "./migrations.js";

/**
 * 打开（或新建）fleet.db 并跑完迁移。
 * 文件数据库开 WAL + synchronous NORMAL 换吞吐；测试用的 ":memory:" 没有独立的
 * journal 文件，这两项没意义，跳过。foreign_keys 和 busy_timeout 两种库都要开。
 */
export function openDatabase(filePath: string, backupDir?: string): DatabaseSync {
  const isFileBacked = filePath !== ":memory:";
  if (isFileBacked) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  const db = new DatabaseSync(filePath);
  try {
    if (isFileBacked) {
      db.exec("PRAGMA journal_mode = WAL;");
      db.exec("PRAGMA synchronous = NORMAL;");
    }
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA busy_timeout = 5000;");

    const version = readUserVersion(db);
    if (
      isFileBacked &&
      backupDir !== undefined &&
      version >= 1 &&
      version < LATEST_SCHEMA_VERSION
    ) {
      backupDatabase(db, backupDir, version);
    }
    runMigrations(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function backupDatabase(db: DatabaseSync, backupDir: string, version: number): void {
  try {
    mkdirSync(backupDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    let backupPath = join(backupDir, `fleet-v${version}-${timestamp}.db`);
    let suffix = 1;
    while (existsSync(backupPath)) {
      backupPath = join(backupDir, `fleet-v${version}-${timestamp}-${suffix}.db`);
      suffix += 1;
    }
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}';`);

    // 清理旧备份是「成功备份之后」的顺手活，不是备份的一部分：
    // 这一步失败（Windows 上旧备份正被占用就会删不掉）不能让已经写好的备份作废、
    // 更不能拦住启动。这里没有日志对象，所以静默忽略，下次升级再删。
    try {
      const backups = readdirSync(backupDir)
        .filter((name) => /^fleet-v\d+-.+\.db$/.test(name))
        .sort();
      for (const stale of backups.slice(0, Math.max(0, backups.length - 10))) {
        unlinkSync(join(backupDir, stale));
      }
    } catch {
      // 故意忽略，理由见上。
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new FleetError("internal", `数据库升级前备份失败：${detail}`);
  }
}
