import {
  addLocalDays,
  type RunRecord,
  startOfLocalDay,
  type TimeZone,
  type WorkerRecord,
} from "@fleet/core";
import { localTimeOfDay, localWeekday, mulberry32, randomInt } from "./historyRandom";
import { type HistoryContext, nextHistoryWorker } from "./historyRecords";
import { browserTimeZone, DEMO_NOW_MS } from "./records";

export { mulberry32 };

/**
 * 30 天历史：用固定种子的伪随机生成 DEMO_NOW 之前 30 个本地日（含今天到 12:10 为止）
 * 的已结束任务。同一个种子两次生成完全相同，不取当前时间。
 * 口径见 design/演示数据.md 第 3 节；记录本身怎么编译在 historyRecords.ts。
 */

/** 历史窗口：DEMO_NOW 往前数 30 个本地日（含今天） */
const HISTORY_DAYS = 30;
/** 每天最早的创建时刻（本地分钟数）：09:00 */
const DAY_FIRST_MINUTE = 9 * 60;
/** 每天最晚的创建时刻（本地分钟数）：23:59 */
const DAY_LAST_MINUTE = 23 * 60 + 59;
/** 今天最多创建到 DEMO_NOW 前 15 分钟 */
const TODAY_CUTOFF_MS = DEMO_NOW_MS - 15 * 60_000;
/** 一天有 1440 分钟，今天按已经过去的比例折算任务数 */
const MINUTES_PER_DAY = 1440;

export interface HistoryDataset {
  workers: WorkerRecord[];
  runs: RunRecord[];
}

/** 生成 30 天历史。同一时区下结果完全可复现；不读任何当前时间 */
export function buildHistory(tz: TimeZone): HistoryDataset {
  const random = mulberry32(20260923);
  const todayStartMs = startOfLocalDay(DEMO_NOW_MS, tz);
  const ctx: HistoryContext = { random, titleCursor: {}, count: 0 };
  const workers: WorkerRecord[] = [];
  const runs: RunRecord[] = [];

  for (let back = HISTORY_DAYS - 1; back >= 0; back -= 1) {
    const dayStartMs = addLocalDays(todayStartMs, -back, tz);
    const weekday = localWeekday(dayStartMs, tz);
    const isWeekend = weekday === 0 || weekday === 6;
    const base = isWeekend ? randomInt(random, 8, 16) : randomInt(random, 24, 40);
    const isToday = back === 0;
    // 今天按已过去的分钟数折算任务数（DEMO_NOW 是本地 12:10，即 730 分钟）
    const elapsedMinutes = Math.round((DEMO_NOW_MS - dayStartMs) / 60_000);
    const count = isToday ? Math.round((base * elapsedMinutes) / MINUTES_PER_DAY) : base;
    // 今天的创建窗口在 DEMO_NOW 前 15 分钟处收口，其余天到 23:59
    const cutoffMinute = Math.round((TODAY_CUTOFF_MS - dayStartMs) / 60_000);
    const lastMinute = isToday
      ? Math.max(DAY_FIRST_MINUTE, Math.min(DAY_LAST_MINUTE, cutoffMinute))
      : DAY_LAST_MINUTE;

    for (let index = 0; index < count; index += 1) {
      const minute = randomInt(random, DAY_FIRST_MINUTE, lastMinute);
      const createdAtMs = localTimeOfDay(dayStartMs, minute, tz);
      if (createdAtMs >= TODAY_CUTOFF_MS) {
        continue;
      }
      const built = nextHistoryWorker(ctx, createdAtMs);
      workers.push(built.worker);
      runs.push(...built.runs);
    }
  }

  return { workers, runs };
}

/** 浏览器时区下的历史，给演示数据源直接用 */
export const historyDataset: HistoryDataset = buildHistory(browserTimeZone);
export const historyWorkers: readonly WorkerRecord[] = historyDataset.workers;
export const historyRuns: readonly RunRecord[] = historyDataset.runs;
