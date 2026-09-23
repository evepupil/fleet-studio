/** 调度引擎每秒兜底检查一次时喂进来的一条运行，只带判断超时需要的字段。 */
export interface TimedRun {
  runId: string;
  status: "queued" | "running";
  queuedAt: string;
  /** 工作中才有值；排队中恒为 null */
  startedAt: string | null;
  timeoutMs: number;
  /** null 表示排队不限时 */
  queueTimeoutMs: number | null;
}

export interface Expiry {
  runId: string;
  kind: "timeout" | "queue_timeout";
}

/**
 * 找出这一刻已经超时的运行。`now` 由调用方传入（毫秒时间戳），核心层自己不取时间。
 * 工作中比 startedAt，排队中比 queuedAt；两者都用 Date.parse 转毫秒后再比较。
 * 解析不出来的时间跳过（不抛异常），不会出现在结果里；输出顺序与输入顺序一致。
 */
export function findExpired(runs: readonly TimedRun[], now: number): Expiry[] {
  const expired: Expiry[] = [];
  for (const run of runs) {
    if (run.status === "running") {
      if (run.startedAt === null) {
        continue;
      }
      const startedMs = Date.parse(run.startedAt);
      if (Number.isNaN(startedMs)) {
        continue;
      }
      if (now - startedMs >= run.timeoutMs) {
        expired.push({ runId: run.runId, kind: "timeout" });
      }
    } else {
      if (run.queueTimeoutMs === null) {
        continue;
      }
      const queuedMs = Date.parse(run.queuedAt);
      if (Number.isNaN(queuedMs)) {
        continue;
      }
      if (now - queuedMs >= run.queueTimeoutMs) {
        expired.push({ runId: run.runId, kind: "queue_timeout" });
      }
    }
  }
  return expired;
}
