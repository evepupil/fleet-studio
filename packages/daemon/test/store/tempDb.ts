import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 给文件数据库测试用：每次调用建一个独立的系统临时目录，返回其中一个 db 文件的路径。
 * cleanup 把整个临时目录删掉，测完不留垃圾。
 */
export function createTempDbPath(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "fleet-store-"));
  return {
    dbPath: join(dir, "fleet.db"),
    cleanup: () => {
      // 收尾是尽力而为：删不掉不能让测试跟着失败，但也不能静默吞掉，打一行警告方便发现。
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (error) {
        console.warn(`删除临时目录失败（可能是系统占用），忽略：${dir}`, error);
      }
    },
  };
}
