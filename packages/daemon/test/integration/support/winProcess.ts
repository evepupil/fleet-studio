/**
 * 结束进程超时、重试风暴放弃等场景需要在 Windows 上核对「进程（含子进程）确实已经结束」，
 * 写法和 test/process/killTree.test.ts 里验证 killTree 本身用的方式一致：按精确 pid 查
 * Win32_Process，而不是按脚本名这类特征broad 匹配——本机同时跑着别的测试文件时，broad
 * 匹配会把别的用例还活着的假苦工进程也算进来，判断就不准了。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function parsePidList(stdout: string): number[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => !Number.isNaN(pid));
}

/** 某个 pid 目前的直接子进程列表。 */
export async function findChildPids(parentPid: number): Promise<number[]> {
  const { stdout } = await execFileAsync("powershell", [
    "-NoProfile",
    "-Command",
    `Get-CimInstance Win32_Process -Filter "ParentProcessId=${parentPid}" | Select-Object -ExpandProperty ProcessId`,
  ]);
  return parsePidList(stdout);
}

/** 某个 pid 是否还存在（不核对映像名——调用方已经通过轨迹文件精确拿到过这个 pid）。 */
export async function isPidAlive(pid: number): Promise<boolean> {
  const { stdout } = await execFileAsync("powershell", [
    "-NoProfile",
    "-Command",
    `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object -ExpandProperty ProcessId`,
  ]);
  return parsePidList(stdout).length > 0;
}
