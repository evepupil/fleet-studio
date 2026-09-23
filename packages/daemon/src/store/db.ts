import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "./migrations.js";

/**
 * 打开（或新建）fleet.db 并跑完迁移。
 * 文件数据库开 WAL + synchronous NORMAL 换吞吐；测试用的 ":memory:" 没有独立的
 * journal 文件，这两项没意义，跳过。foreign_keys 和 busy_timeout 两种库都要开：
 * 前者让级联删除生效，后者让并发访问在锁上排队而不是直接报 SQLITE_BUSY。
 */
export function openDatabase(filePath: string): DatabaseSync {
  const isFileBacked = filePath !== ":memory:";
  if (isFileBacked) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  const db = new DatabaseSync(filePath);
  if (isFileBacked) {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
  }
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");

  runMigrations(db);
  return db;
}
