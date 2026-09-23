import { openDatabase } from "./db.js";
import { createProjectRepo } from "./projectRepo.js";
import { createRunRepo } from "./runRepo.js";
import type { Repos } from "./types.js";
import { createWorkerRepo } from "./workerRepo.js";

/**
 * 存储层对外的唯一入口：打开数据库、装好三个仓库、提供事务和关闭。
 * 事务用 SAVEPOINT 实现而不是 BEGIN：调用方哪怕把 transaction() 嵌套调用，
 * 每层也有自己独立编号的保存点，出错只回滚到当前这一层，不会因为「已经在事务里」报错。
 */
export function createRepos(filePath: string): Repos {
  const db = openDatabase(filePath);
  let depth = 0;

  function transaction<T>(fn: () => T): T {
    const savepoint = `fleet_sp_${depth}`;
    depth += 1;
    db.exec(`SAVEPOINT ${savepoint};`);
    try {
      const result = fn();
      db.exec(`RELEASE ${savepoint};`);
      return result;
    } catch (error) {
      db.exec(`ROLLBACK TO ${savepoint};`);
      db.exec(`RELEASE ${savepoint};`);
      throw error;
    } finally {
      depth -= 1;
    }
  }

  return {
    projects: createProjectRepo(db),
    workers: createWorkerRepo(db),
    runs: createRunRepo(db),
    transaction,
    close(): void {
      db.close();
    },
  };
}
