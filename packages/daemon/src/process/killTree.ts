/**
 * 结束整棵进程树。苦工是分离启动的进程组组长，普通 kill 杀不掉它另外拉起的子进程
 * （比如 bash 工具临时起的 shell），必须连子进程一起杀（模块设计第 3.4 节）。
 */

import { FleetError } from "@fleet/core";
import { runBackgroundCommand } from "./backgroundCommand.js";
import { isProcessAlive } from "./processProbe.js";

export async function killTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await killTreeWindows(pid);
    return;
  }
  await killTreePosix(pid);
}

/**
 * taskkill 失败的原因可能是「进程已经不在了」（该当成功返回），也可能是真的杀不掉。
 * 开发过程中实测过：同一台机器上，taskkill 对「找不到进程」的失败文案会随启动环境在
 * 英文和乱码（控制台代码页不一致）之间变化，字符串匹配不可靠；直接回查一次存活状态
 * 才是稳的判断方式——这也正是「没有找到进程」这类失败要达成的最终目标。
 */
async function killTreeWindows(pid: number): Promise<void> {
  try {
    await runBackgroundCommand("taskkill", ["/PID", String(pid), "/T", "/F"]);
    return;
  } catch (error) {
    if (!(await isProcessAlive(pid, null))) {
      return;
    }
    throw new FleetError("internal", `结束进程失败：${describeError(error)}`);
  }
}

async function killTreePosix(pid: number): Promise<void> {
  try {
    // 分离启动的进程是它自己进程组的组长，杀负的 pid 相当于杀整个组。
    process.kill(-pid, "SIGKILL");
    return;
  } catch {
    // 杀进程组失败（比如系统不支持，或组本来就不存在），退回杀单个进程。
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if (isEsrch(error)) {
      return;
    }
    throw new FleetError("internal", `结束进程失败：${describeError(error)}`);
  }
}

function isEsrch(error: unknown): boolean {
  return error instanceof Error && toErrnoCode(error) === "ESRCH";
}

function toErrnoCode(error: Error): unknown {
  // Error 本身没有声明 code 字段，用 in narrowing 而不是断言/弱类型赋值来安全读它。
  return "code" in error ? error.code : undefined;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
