/**
 * 进程身份核对（模块设计：服务层-进程托管 3.5）：进程号会被系统很快复用给新进程，
 * 只核对映像名挡不住同样是 node.exe 的无关进程，还要核对「进程创建时间不晚于我们
 * 拿到这个号的时刻」。这里只提供纯函数和批量查询，怎么用在 processHost.ts 里组装。
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProcessIdentity } from "./types.js";

const execFileAsync = promisify(execFile);

/** 核对创建时间时允许的误差：我们的系统时钟和 WMI 报告的创建时间可能有轻微偏差。 */
export const IDENTITY_CLOCK_TOLERANCE_MS = 2000;

/** 从操作系统查到的、判断身份用得到的事实。 */
export interface ProcessFacts {
  image: string;
  createdAtMs: number;
}

/**
 * 解析每行 `<进程号>|<映像名>|<创建时间毫秒>` 的输出（createIdentityProbe 默认查询的格式）。
 * 空行、字段不全、数字解析失败的行直接跳过，不抛异常——毕竟这是外部命令的输出。
 */
export function parseProcessFactsLines(output: string): Map<number, ProcessFacts> {
  const facts = new Map<number, ProcessFacts>();
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }
    const [pidText, image, createdAtText] = line.split("|");
    if (pidText === undefined || image === undefined || createdAtText === undefined) {
      continue;
    }
    const pid = Number.parseInt(pidText, 10);
    const createdAtMs = Number.parseInt(createdAtText, 10);
    if (!Number.isInteger(pid) || !Number.isInteger(createdAtMs)) {
      continue;
    }
    facts.set(pid, { image, createdAtMs });
  }
  return facts;
}

/**
 * `identity.image` 非 null 时映像名不区分大小写相等；`identity.spawnedAtMs` 非 null 时
 * `facts.createdAtMs` 不晚于 `spawnedAtMs + 容差`；两项都满足（为 null 的项不核对）才为真。
 */
export function matchesIdentity(facts: ProcessFacts, identity: ProcessIdentity): boolean {
  if (identity.image !== null && facts.image.toLowerCase() !== identity.image.toLowerCase()) {
    return false;
  }
  if (
    identity.spawnedAtMs !== null &&
    facts.createdAtMs > identity.spawnedAtMs + IDENTITY_CLOCK_TOLERANCE_MS
  ) {
    return false;
  }
  return true;
}

/** 查询一批进程号的事实，返回原始输出文本（默认实现是 PowerShell，测试可以注入假的）。 */
export type IdentityQuery = (pids: readonly number[]) => Promise<string>;

export interface IdentityProbe {
  /** 查一个进程号的事实；查不到返回 null。同一轮事件循环里的多次调用会合并成一次查询。 */
  lookup(pid: number): Promise<ProcessFacts | null>;
}

/** pid 只来自数据库里的整数，拼进 PowerShell 命令之前必须确认是正整数，不能是别的字符串。 */
function assertPositivePid(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`进程号不是正整数，拒绝拼进查询命令：${pid}`);
  }
}

/** 仅 Windows：用 Get-CimInstance 一次查一批进程号的映像名和创建时间。 */
async function defaultQuery(pids: readonly number[]): Promise<string> {
  const filter = pids.map((pid) => `ProcessId=${pid}`).join(" OR ");
  const command =
    `Get-CimInstance Win32_Process -Filter "${filter}" | ` +
    `ForEach-Object { "{0}|{1}|{2}" -f $_.ProcessId, $_.Name, ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() }`;
  const { stdout } = await execFileAsync("powershell", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    command,
  ]);
  return stdout;
}

interface PendingLookup {
  pid: number;
  resolve: (facts: ProcessFacts | null) => void;
  reject: (error: unknown) => void;
}

/**
 * 同一轮事件循环里的多个 `lookup` 合并成一次查询（用 `setImmediate` 攒一批），
 * 避免接管了很多苦工时每 2 秒探活都起一堆 PowerShell 进程。
 */
export function createIdentityProbe(query: IdentityQuery = defaultQuery): IdentityProbe {
  let batch: PendingLookup[] | null = null;

  async function flush(items: readonly PendingLookup[]): Promise<void> {
    const pids = [...new Set(items.map((item) => item.pid))];
    try {
      for (const pid of pids) {
        assertPositivePid(pid);
      }
      const output = await query(pids);
      const facts = parseProcessFactsLines(output);
      for (const item of items) {
        item.resolve(facts.get(item.pid) ?? null);
      }
    } catch (error) {
      for (const item of items) {
        item.reject(error);
      }
    }
  }

  return {
    lookup(pid: number): Promise<ProcessFacts | null> {
      return new Promise((resolve, reject) => {
        if (batch === null) {
          const current: PendingLookup[] = [];
          batch = current;
          setImmediate(() => {
            batch = null;
            void flush(current);
          });
        }
        batch.push({ pid, resolve, reject });
      });
    },
  };
}
