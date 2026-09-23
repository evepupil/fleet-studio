/** 测试用临时目录：每个用例一个独立目录，用完删除，不留垃圾在系统临时目录里。 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function removeTempDir(dir: string): Promise<void> {
  // 收尾是尽力而为：删不掉不能让测试因为这个跟业务逻辑无关的系统时序问题变红，
  // 但也不能静默吞掉，打一行警告方便事后发现真的删不掉的目录。
  try {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    console.warn(`删除临时目录失败（可能是系统占用），忽略：${dir}`, error);
  }
}

/** 建好父目录再写文本文件，测试里经常要在临时目录深处放一个文件。 */
export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

/** 建好父目录再写 JSON 文件（用于伪造 package.json 之类的固件）。 */
export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await writeTextFile(filePath, JSON.stringify(data, null, 2));
}
