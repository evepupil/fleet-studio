/**
 * 每个用例的 afterEach 收尾：服务停止后不会主动杀任何苦工进程（这是刻意的行为，见
 * 模块设计《服务层-调度引擎》3.1「stop()：苦工进程继续运行，等下次启动接管」），所以
 * hang / spawn-child-hang 之类永不自己退出的假苦工，测试结束后必须自己找出来结束掉，
 * 不然会在开发机上越攒越多。
 *
 * 「有没有对应的 end」按轨迹编号判断，不按进程号——进程号会被系统重复分配（全仓并行跑
 * 时机器每秒起几十个进程，同一个号在一两秒内被后一个苦工拿到并不罕见）；如果只看进程号，
 * 一个真正还在跑的苦工可能因为它的进程号恰好和另一个早就正常结束的苦工撞上而被判定成
 * 「已经结束」，从而漏杀。轨迹里没有编号的旧格式行（现在的假苦工不会再写这种行，只是
 * 兜底）才退回按进程号判断。
 *
 * 更要紧的是：这里记下来的「残留」大多是重试风暴、运行超时、取消这类场景里已经被服务
 * 自己结束过的进程——收尾函数真正执行的时候（几秒之后）,它们的进程号很可能已经被系统
 * 重新分配给了完全无关的进程：另一个测试文件这时正在跑的假苦工、本机用户桌面上随便什么
 * 程序，都有可能。taskkill /T 会连同它的整棵子进程树一起杀掉，杀错人代价不小。所以动手
 * 之前必须先用 isPidAlive(pid, 这一行 start 记录的时间) 核对「现在这个号是不是还是它」，
 * 核对不通过就当它已经结束、跳过，绝不能拿到号就直接杀。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { safeReadTrace } from "./trace.js";
import { isPidAlive, waitForPidGone } from "./winProcess.js";

const execFileAsync = promisify(execFile);

/** taskkill /F 请求结束后不保证立刻释放句柄（工作目录、打开的文件……）；给一小段时间
 * 让 OS 真正收尾，避免调用方紧接着删临时目录时撞上 EBUSY/ENOTEMPTY。 */
const DEAD_CHECK_TIMEOUT_MS = 3000;
const DEAD_CHECK_INTERVAL_MS = 100;

/** isPidAlive 靠 PowerShell 的 Get-CimInstance，只在 Windows 上能用；POSIX 上
 * process.kill(pid, "SIGKILL") 是同步系统调用，没有这个「句柄还没释放」的问题。这里只是
 * 尽力而为的收尾，不是断言：等不到就算了，不能让 afterEach 本身抛出去。createdAtMs 传给
 * waitForPidGone，避免把「同一个号但创建时间明显更晚的别的进程」误判成还没结束。 */
async function waitUntilDead(pid: number, createdAtMs: number): Promise<void> {
  if (process.platform !== "win32") {
    return;
  }
  try {
    await waitForPidGone(pid, DEAD_CHECK_TIMEOUT_MS, DEAD_CHECK_INTERVAL_MS, createdAtMs);
  } catch {
    // 等满 3 秒还没消失也不当错误处理：调用方接下来删临时目录时，fs.rm 自带的重试
    // 还能再兜一次底。
  }
}

/**
 * 先核对这个号现在还是不是我们记录的那个进程（isPidAlive 传创建时间上界，留 1 秒容差），
 * 核对不通过就当它已经结束，直接跳过——不能拿到一个号就不分青红皂白地 taskkill /T，
 * 那会连着一整棵不相干的进程树一起杀掉。核对通过才真的动手结束它。
 */
async function killIfStillTheSameProcess(pid: number, createdAtMs: number): Promise<void> {
  const stillTheSameProcess = await isPidAlive(pid, createdAtMs);
  if (!stillTheSameProcess) {
    return;
  }
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
  await waitUntilDead(pid, createdAtMs);
}

export async function killLeftoverFakeWorkers(traceFile: string): Promise<void> {
  const entries = safeReadTrace(traceFile);
  // pid → 这一行 start 记录的时间，杀之前用来核对身份。
  const leftovers = new Map<number, number>();

  // 主路径：按轨迹编号精确判断，不受进程号复用影响。
  const withTraceId = entries.filter((entry) => entry.traceId !== null);
  const endedTraceIds = new Set(
    withTraceId.filter((entry) => entry.event === "end").map((entry) => entry.traceId),
  );
  for (const entry of withTraceId) {
    if (entry.event === "start" && !endedTraceIds.has(entry.traceId)) {
      leftovers.set(entry.pid, entry.at);
    }
  }

  // 兜底路径：没有轨迹编号的旧格式行退回按进程号判断（现在的假苦工总会写编号，
  // 正常情况下这条路径不会被用到）。
  const withoutTraceId = entries.filter((entry) => entry.traceId === null);
  const endedPidsLegacy = new Set(
    withoutTraceId.filter((entry) => entry.event === "end").map((entry) => entry.pid),
  );
  for (const entry of withoutTraceId) {
    if (entry.event === "start" && !endedPidsLegacy.has(entry.pid)) {
      leftovers.set(entry.pid, entry.at);
    }
  }

  await Promise.all(
    [...leftovers.entries()].map(([pid, startAt]) => killIfStillTheSameProcess(pid, startAt)),
  );
}
