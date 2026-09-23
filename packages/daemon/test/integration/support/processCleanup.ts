/**
 * 每个用例的 afterEach 收尾：服务停止后不会主动杀任何苦工进程（这是刻意的行为，见
 * 模块设计《服务层-调度引擎》3.1「stop()：苦工进程继续运行，等下次启动接管」），所以
 * hang / spawn-child-hang 之类永不自己退出的假苦工，测试结束后必须自己找出来结束掉，
 * 不然会在开发机上越攒越多。
 *
 * 判断「谁还没结束」全靠这个用例自己专属的轨迹文件（每个测试的 FLEET_FAKE_TRACE 都指向
 * 一个独立文件，见 support/harness.ts）：写过 start 却没有对应 end 的 pid，要么是测试
 * 场景本身就不会自己退出，要么是测试提前结束时来不及等它退出，两种都需要强制结束。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { safeReadTrace } from "./trace.js";
import { isPidAlive } from "./winProcess.js";

const execFileAsync = promisify(execFile);

/** taskkill /F 请求结束后不保证立刻释放句柄（工作目录、打开的文件……）；给一小段时间
 * 让 OS 真正收尾，避免调用方紧接着删临时目录时撞上 EBUSY/ENOTEMPTY。 */
const DEAD_CHECK_TIMEOUT_MS = 3000;
const DEAD_CHECK_INTERVAL_MS = 100;

/** isPidAlive 靠 PowerShell 的 Get-CimInstance，只在 Windows 上能用；POSIX 上
 * process.kill(pid, "SIGKILL") 是同步系统调用，没有这个「句柄还没释放」的问题。 */
async function waitUntilDead(pid: number): Promise<void> {
  if (process.platform !== "win32") {
    return;
  }
  const deadline = Date.now() + DEAD_CHECK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!(await isPidAlive(pid))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, DEAD_CHECK_INTERVAL_MS));
  }
}

async function killPidIfAlive(pid: number): Promise<void> {
  try {
    if (process.platform === "win32") {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"]);
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch {
    // 进程已经不在了，或者结束失败也没有更好的办法——测试收尾不能因为这个失败而报错，
    // 顶多留下一个已经无害的僵尸记录。
  }
  await waitUntilDead(pid);
}

export async function killLeftoverFakeWorkers(traceFile: string): Promise<void> {
  const entries = safeReadTrace(traceFile);
  const endedPids = new Set(
    entries.filter((entry) => entry.event === "end").map((entry) => entry.pid),
  );
  const leftoverPids = new Set(
    entries
      .filter((entry) => entry.event === "start" && !endedPids.has(entry.pid))
      .map((entry) => entry.pid),
  );
  await Promise.all([...leftoverPids].map((pid) => killPidIfAlive(pid)));
}
