/**
 * 结束进程超时、重试风暴放弃等场景需要在 Windows 上核对「进程（含子进程）确实已经结束」，
 * 写法和 test/process/killTree.test.ts 里验证 killTree 本身用的方式一致：按精确 pid 查
 * Win32_Process，而不是按脚本名这类特征broad 匹配——本机同时跑着别的测试文件时，broad
 * 匹配会把别的用例还活着的假苦工进程也算进来，判断就不准了。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { waitFor } from "./poll.js";

const execFileAsync = promisify(execFile);

/** Windows 会重复分配进程号，判断「这个进程创建时间是不是还是我们等的那个」时留的容差。 */
const CREATION_TIME_TOLERANCE_MS = 1000;

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

/** 查询某个 pid 的创建时间（Unix 毫秒）；进程不存在时为 null。 */
async function queryProcessCreationTimeMs(pid: number): Promise<number | null> {
  const { stdout } = await execFileAsync("powershell", [
    "-NoProfile",
    "-Command",
    `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | ForEach-Object { [math]::Floor(([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds()) }`,
  ]);
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * 某个 pid 是否还存在（不核对映像名——调用方已经通过轨迹文件精确拿到过这个 pid）。
 *
 * Windows 会重复分配进程号（实测：8 路并行起 300 个短命进程，26 次拿到用过的号；全仓
 * 并行跑时机器每秒起几十个进程，同一个号在一两秒内被后一个苦工拿到并不罕见）。传
 * createdNoLaterThanMs 时，只有查到的进程创建时间不晚于它（留 1 秒容差）才算「还是我们
 * 要等的这个进程」——如果这个号在等待期间被系统复用给了另一个更晚创建的进程，那个新
 * 进程不该被当成我们还在等的旧进程还活着。不传这个参数时行为和以前完全一样，只看这个
 * 号有没有对应的进程，不管它是谁。
 */
export async function isPidAlive(pid: number, createdNoLaterThanMs?: number): Promise<boolean> {
  if (createdNoLaterThanMs === undefined) {
    const { stdout } = await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object -ExpandProperty ProcessId`,
    ]);
    return parsePidList(stdout).length > 0;
  }
  const createdAt = await queryProcessCreationTimeMs(pid);
  if (createdAt === null) {
    return false;
  }
  return createdAt <= createdNoLaterThanMs + CREATION_TIME_TOLERANCE_MS;
}

/**
 * 等到某个 pid 从进程列表里彻底消失，最多等 timeoutMs（默认 5 秒）；超时会抛出带清楚
 * 说明的异常，让测试失败信息本身就说明白「等了多久还没消失」。
 *
 * 不要写成「先 waitFor 再补一次 isPidAlive 断言」这种两段式：进程被 taskkill /F 结束后，
 * Windows 不保证立刻从进程列表里摘掉这一条记录，开发机负载高、并行跑很多测试文件时这个
 * 「即将消失」的窗口会被拉长；统一收口成一个轮询直到消失的函数，谁调用谁就不用再自己
 * 拼这两段。
 *
 * createdNoLaterThanMs：调用方手上已有的、这个 pid 对应进程的创建时间上界（苦工进程用
 * 轨迹里 start 的时间；子进程用调用 findChildPids 拿到它时的当前时间）。不传时按老办法
 * 直接查这个号是否存在——负载高时这个号如果在 5 秒等待窗口内被系统上任何别的进程拿走，
 * 就会一直误判成「还活着」直到超时；传了这个参数就能把「同一个号但创建时间明显更晚的
 * 别的进程」排除掉。
 */
export async function waitForPidGone(
  pid: number,
  timeoutMs = 5000,
  intervalMs = 100,
  createdNoLaterThanMs?: number,
): Promise<void> {
  await waitFor(async () => !(await isPidAlive(pid, createdNoLaterThanMs)), timeoutMs, intervalMs);
}
