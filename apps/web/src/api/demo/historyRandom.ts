import { type TimeZone, WORKER_ID_ALPHABET } from "@fleet/core";

/**
 * 历史生成用的随机和本地时间工具。随机是自写的 mulberry32（十几行），
 * 同一个种子得到同一串数，所以历史每次生成结果相同。
 */

/** 自写的伪随机：同一 seed 得到同一串数，用来生成可复现的历史 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 加权取一项：权重都是正整数，取不到时抛错（表写错了要立刻发现） */
export function pickWeighted<T>(random: () => number, items: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, weight] of items) {
    total += weight;
  }
  let roll = random() * total;
  for (const [value, weight] of items) {
    roll -= weight;
    if (roll < 0) {
      return value;
    }
  }
  const last = items[items.length - 1];
  if (last === undefined) {
    throw new Error("加权表是空的");
  }
  return last[0];
}

/** [min, max] 之间的均匀整数（含两端） */
export function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/** [min, max) 之间的均匀小数 */
export function randomFloat(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

/**
 * 本地某天「第 minutes 分钟」对应的 UTC 毫秒。
 * 先按当天的偏移算一次，再用该时刻的偏移纠正一次（跨夏令时那天才不会偏一小时）。
 */
export function localTimeOfDay(dayStartMs: number, minutes: number, tz: TimeZone): number {
  const naive = dayStartMs + minutes * 60_000;
  const drift = tz.offsetMinutes(naive) - tz.offsetMinutes(dayStartMs);
  return naive - drift * 60_000;
}

/** 本地日期是周几：0 = 周日、6 = 周六 */
export function localWeekday(dayStartMs: number, tz: TimeZone): number {
  const localMs = dayStartMs + tz.offsetMinutes(dayStartMs) * 60_000;
  return new Date(localMs).getUTCDay();
}

/** `h` + 5 位 31 进制字符：字母表[0] = "a"，高位补 "a"，只用苦工编号的字母表 */
export function historyId(index: number): string {
  const base = WORKER_ID_ALPHABET.length;
  let value = index;
  let suffix = "";
  for (let position = 0; position < 5; position += 1) {
    suffix = WORKER_ID_ALPHABET.charAt(value % base) + suffix;
    value = Math.floor(value / base);
  }
  return `h${suffix}`;
}
