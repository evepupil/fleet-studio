/**
 * 集成测试用的临时目录：每个用例（服务数据目录、甲/乙项目目录……）都要一个独立目录，
 * 用完删除，不留垃圾在系统临时目录里。和其它测试路（app/engine/http）各自维护的同名
 * 小工具是同一个写法，但集成测试只能写 test/integration/** 下的文件，这里单独放一份。
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function removeTempDir(dir: string): Promise<void> {
  // Windows 上残留的子进程可能还占着目录里的文件句柄一小会儿；fs.rm 内置的重试退避
  // 几次就稳了（engine 测试路的 support/testEngine.ts 也是同样的处理）。重试用完了还是
  // 删不掉的话，收尾是尽力而为，不能让测试因为这个跟业务逻辑无关的系统时序问题变红；
  // 但也不能静默吞掉，打一行警告方便事后发现真的删不掉的目录。
  try {
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch (error) {
    console.warn(`删除临时目录失败（可能是系统占用），忽略：${dir}`, error);
  }
}
