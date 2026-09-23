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
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
