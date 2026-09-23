import type { WorkerSummary } from "@fleet/core";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

/** 时长格式（规格 3.5）：不足 1 分钟「45秒」，不足 1 小时「3分12秒」，否则「1时05分」。 */
export function formatDuration(ms: number): string {
  const clamped = Math.max(0, Math.floor(ms));
  if (clamped < MINUTE_MS) {
    return `${Math.floor(clamped / SECOND_MS)}秒`;
  }
  if (clamped < HOUR_MS) {
    const minutes = Math.floor(clamped / MINUTE_MS);
    const seconds = Math.floor((clamped % MINUTE_MS) / SECOND_MS);
    return `${minutes}分${seconds}秒`;
  }
  const hours = Math.floor(clamped / HOUR_MS);
  const minutes = Math.floor((clamped % HOUR_MS) / MINUTE_MS);
  return `${hours}时${String(minutes).padStart(2, "0")}分`;
}

/**
 * 苦工时长的起止点：开始时间取 startedAt，还没开始过就用 queuedAt（此时显示的其实是
 * 排队时长）；结束时间取 endedAt，还没结束就用 now（显示到目前为止经过的时间）。
 */
export function elapsedMs(
  worker: Pick<WorkerSummary, "queuedAt" | "startedAt" | "endedAt">,
  now: Date,
): number {
  const start = new Date(worker.startedAt ?? worker.queuedAt).getTime();
  const end = worker.endedAt !== null ? new Date(worker.endedAt).getTime() : now.getTime();
  return Math.max(0, end - start);
}
