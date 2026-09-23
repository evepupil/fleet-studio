/** 测试用临时目录：每个用例一个独立目录，用完删除，不留垃圾在系统临时目录里。 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/**
 * 关掉 SQLite 文件库之后，Windows 上 -shm/-wal 这类辅助文件有时还会被系统（杀毒软件、
 * 索引服务）短暂占用；先加几次重试等它松手。测试本身要验证的行为在走到这里之前已经
 * 断言完了，实在删不掉也只是留一点临时文件垃圾，不应该让测试因为这个跟业务逻辑无关的
 * 系统时序问题变红，所以重试用完之后只记一条警告，不再抛出。
 */
export async function removeTempDir(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (error) {
    console.warn(`删除临时目录失败（可能是系统占用），忽略：${dir}`, error);
  }
}
