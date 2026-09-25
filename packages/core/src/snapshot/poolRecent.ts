import type { PoolRecent } from "../api/dto.js";
import type { RunRecord } from "../domain/records.js";
import { RECENT_WINDOW_HOURS } from "./constants.js";

/**
 * 池最近 24 小时的战绩：只数结束时间落在 (now − 24h, now] 的已完成 / 失败运行，
 * 取消的既不算完成也不算失败（它是人为中止，不代表通道有问题）。
 */
export function buildPoolRecent(runs: readonly RunRecord[], nowMs: number): PoolRecent {
  const windowStartMs = nowMs - RECENT_WINDOW_HOURS * 60 * 60 * 1000;
  let completed = 0;
  let failed = 0;
  const durations: number[] = [];

  for (const run of runs) {
    if (run.status !== "completed" && run.status !== "failed") {
      continue;
    }
    if (!isEndedWithinWindow(run.endedAt, windowStartMs, nowMs)) {
      continue;
    }
    if (run.status === "completed") {
      completed += 1;
    } else {
      failed += 1;
    }
    const duration = runDurationMs(run);
    if (duration !== null) {
      durations.push(duration);
    }
  }

  return {
    windowHours: RECENT_WINDOW_HOURS,
    completed,
    failed,
    avgRunMs: averageRounded(durations),
  };
}

/**
 * 这次运行真正在跑的毫秒数：结束时就记过 runMs 的用现成的；
 * 没记过的（历史数据或异常收场）用 endedAt − startedAt 补；两个时间缺一个就无从补算。
 */
function runDurationMs(run: RunRecord): number | null {
  if (run.runMs !== null) {
    return run.runMs;
  }
  if (run.startedAt === null || run.endedAt === null) {
    return null;
  }
  return Math.max(0, Date.parse(run.endedAt) - Date.parse(run.startedAt));
}

function averageRounded(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return Math.round(sum / values.length);
}

/** (now − 窗口, now] 之内结束，恰好等于窗口起点的不算。 */
export function isEndedWithinWindow(
  endedAt: string | null,
  windowStartMs: number,
  nowMs: number,
): boolean {
  if (endedAt === null) {
    return false;
  }
  const endedAtMs = Date.parse(endedAt);
  return endedAtMs > windowStartMs && endedAtMs <= nowMs;
}
