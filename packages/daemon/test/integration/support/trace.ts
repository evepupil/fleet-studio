/**
 * 轨迹文件读取封装（@fleet/testkit 的 readTrace 之上再加一层）：文件还没被第一个假苦工
 * 写过之前是不存在的，读不到就当空列表；再配一个「等到写满 N 条 start」的轮询，供需要
 * 拿到某次运行真实 pid 或 argv 的测试使用。
 */
import { readTrace, type TraceEntry } from "@fleet/testkit";
import { waitFor } from "./poll.js";

export function safeReadTrace(traceFile: string): TraceEntry[] {
  try {
    return readTrace(traceFile);
  } catch {
    return [];
  }
}

/** 等到轨迹文件里至少有 count 条 start 记录，返回那一刻读到的完整轨迹。 */
export async function waitForTraceStarts(
  traceFile: string,
  count: number,
  timeoutMs = 5000,
): Promise<TraceEntry[]> {
  let entries: TraceEntry[] = [];
  await waitFor(() => {
    entries = safeReadTrace(traceFile);
    return entries.filter((entry) => entry.event === "start").length >= count;
  }, timeoutMs);
  return entries;
}

/** 轨迹里所有 start 记录，按发生顺序（轨迹文件本来就是追加写的，天然按时间先后）。 */
export function startEntries(entries: readonly TraceEntry[]): TraceEntry[] {
  return entries.filter((entry) => entry.event === "start");
}

/** 某个进程启动时收到的 argv 里，紧跟在 flag 后面的那个值；flag 不存在或没有 args 记录时为 undefined。 */
export function findArgValue(args: readonly string[] | null, flag: string): string | undefined {
  if (args === null) {
    return undefined;
  }
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}
