/**
 * 假苦工测试辅助：定位假 pi / 假 opencode 脚本、拼剧本标记、读轨迹文件。
 * 规格见 docs/模块设计/测试支撑-假苦工.md 第 3.4 节。
 *
 * 本包只给测试用，生产代码不得依赖（模块设计第 1 节）。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 脚本路径用 import.meta.url 相对定位：src/index.ts（vitest 直接跑源码）和编译后的
// dist/index.js 都在 packages/testkit/ 下同一层深度，"../bin/xxx.mjs" 从两边出发都能找到。
const FAKE_PI_SCRIPT = fileURLToPath(new URL("../bin/fake-pi.mjs", import.meta.url));
const FAKE_OPENCODE_SCRIPT = fileURLToPath(new URL("../bin/fake-opencode.mjs", import.meta.url));

/** 假 pi 的启动命令：直接写进配置的 `runtimes.pi.command`。 */
export function fakePiCommand(): string[] {
  return [process.execPath, FAKE_PI_SCRIPT];
}

/** 假 opencode 的启动命令：直接写进配置的 `runtimes.opencode.command`。 */
export function fakeOpencodeCommand(): string[] {
  return [process.execPath, FAKE_OPENCODE_SCRIPT];
}

/** scenarioPrompt 的可选项；字段含义见模块设计文档第 3.1 节的标记表。 */
export interface ScenarioPromptOptions {
  /** 相邻两个输出事件之间的间隔（毫秒）；缺省 20。 */
  delayMs?: number;
  /** success 剧本里调用几次工具；缺省 1。 */
  tools?: number;
  /** crash 剧本的退出码；缺省 3。 */
  exitCode?: number;
  /** 追加在标记后面的普通任务文字，纯粹方便读日志时认出是哪个用例。 */
  text?: string;
}

/**
 * 拼出带 `[[scenario:...]]` 标记的任务文字，喂给假 pi / 假 opencode。
 * 标记的解析规则（以及每个标记的缺省值）由 `packages/testkit/bin/scenario.mjs` 里的
 * `parseScenario` 负责，这里只管拼字符串，两边约定的标记格式必须完全一致。
 */
export function scenarioPrompt(name: string, options: ScenarioPromptOptions = {}): string {
  const markers = [`[[scenario:${name}]]`];
  if (options.delayMs !== undefined) {
    markers.push(`[[delay:${options.delayMs}]]`);
  }
  if (options.tools !== undefined) {
    markers.push(`[[tools:${options.tools}]]`);
  }
  if (options.exitCode !== undefined) {
    markers.push(`[[exit:${options.exitCode}]]`);
  }
  const head = markers.join(" ");
  return options.text === undefined ? head : `${head} ${options.text}`;
}

/** 轨迹文件里的一行；`end` 行没有 `args`（模块设计第 3.3 节）。 */
export interface TraceEntry {
  readonly event: "start" | "end";
  readonly pid: number;
  readonly at: number;
  readonly runtime: "pi" | "opencode";
  readonly cwd: string;
  readonly args: readonly string[] | null;
  /**
   * 假苦工进程自己独一份的编号（进程号 + 启动毫秒 + 随机后缀），同一个进程的 start、end
   * 两行共用同一个值。进程号会被系统重复分配，maxConcurrency 靠这个字段而不是进程号
   * 去认「这是同一个进程」；读到没有这个字段的旧格式轨迹行时为 null。
   */
  readonly traceId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 项目开了 noPropertyAccessFromIndexSignature，Record<string, unknown> 不能用点号读字段；
// 但方括号配字符串字面量又会被 biome 的 useLiteralKeys 规则要求“简化”成点号。统一让 key
// 走一个字符串参数（record[key]，key 是变量不是字面量），两条规则就都满足了。
function getUnknown(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function readEvent(record: Record<string, unknown>): "start" | "end" | undefined {
  const value = getUnknown(record, "event");
  return value === "start" || value === "end" ? value : undefined;
}

function readRuntime(record: Record<string, unknown>): "pi" | "opencode" | undefined {
  const value = getUnknown(record, "runtime");
  return value === "pi" || value === "opencode" ? value : undefined;
}

function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = getUnknown(record, key);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = getUnknown(record, key);
  return typeof value === "string" ? value : undefined;
}

function readStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = getUnknown(record, key);
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return undefined;
    }
    items.push(item);
  }
  return items;
}

/**
 * 一行轨迹 JSON 解析成 TraceEntry；字段缺失、类型不对，或者整行都不是合法 JSON，
 * 就当成不认识的行跳过——轨迹文件只会由本包自己的假苦工写，从严只是避免测试因为脏数据崩掉。
 */
function parseTraceLine(line: string): TraceEntry | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const event = readEvent(parsed);
  const pid = readNumber(parsed, "pid");
  const at = readNumber(parsed, "at");
  const runtime = readRuntime(parsed);
  if (event === undefined || pid === undefined || at === undefined || runtime === undefined) {
    return null;
  }
  return {
    event,
    pid,
    at,
    runtime,
    cwd: readString(parsed, "cwd") ?? "",
    args: readStringArray(parsed, "args") ?? null,
    traceId: readString(parsed, "traceId") ?? null,
  };
}

/** 读轨迹文件，按行解析成 TraceEntry 数组；空行跳过。 */
export function readTrace(file: string): TraceEntry[] {
  const content = readFileSync(file, "utf8");
  const entries: TraceEntry[] = [];
  for (const line of content.split("\n")) {
    if (line.trim().length === 0) {
      continue;
    }
    const entry = parseTraceLine(line);
    if (entry !== null) {
      entries.push(entry);
    }
  }
  return entries;
}

type Delta = { time: number; delta: number };

/**
 * 有轨迹编号的行：同一个编号只属于同一个进程的一次生命周期，按编号精确配对，
 * 完全不看进程号——进程号被复用给别的进程也不会互相干扰。
 */
function deltasByTraceId(entries: readonly TraceEntry[]): Delta[] {
  const endAtByTraceId = new Map<string, number>();
  for (const entry of entries) {
    if (entry.event === "end" && entry.traceId !== null) {
      endAtByTraceId.set(entry.traceId, entry.at);
    }
  }
  const deltas: Delta[] = [];
  for (const entry of entries) {
    if (entry.event !== "start" || entry.traceId === null) {
      continue;
    }
    deltas.push({ time: entry.at, delta: 1 });
    const endAt = endAtByTraceId.get(entry.traceId);
    if (endAt !== undefined) {
      deltas.push({ time: endAt, delta: -1 });
    }
  }
  return deltas;
}

/**
 * 没有轨迹编号的旧格式行：退回按进程号配对，但要按时间顺序处理——同一个进程号出现
 * 新的 start 时，把前一个还没配上 end 的 start 视为已经在这一刻结束（进程号能被系统
 * 复用，说明前一个进程必然已经不在了），结束时间取新 start 的时间，不是漏配对。
 */
function deltasByPidFallback(entries: readonly TraceEntry[]): Delta[] {
  const sorted = [...entries].sort((a, b) => a.at - b.at);
  const openStartAtByPid = new Map<number, number>();
  const deltas: Delta[] = [];
  for (const entry of sorted) {
    if (entry.event === "start") {
      if (openStartAtByPid.has(entry.pid)) {
        deltas.push({ time: entry.at, delta: -1 });
      }
      deltas.push({ time: entry.at, delta: 1 });
      openStartAtByPid.set(entry.pid, entry.at);
    } else if (openStartAtByPid.has(entry.pid)) {
      deltas.push({ time: entry.at, delta: -1 });
      openStartAtByPid.delete(entry.pid);
    }
  }
  return deltas;
}

/**
 * 按 start / end 的时间算出同时在跑的最大进程数。没有匹配到 end 的 start 视为
 * “一直在跑”，只贡献 +1、不配对应的 -1。时间相同时让 end 先结算、start 再生效
 * （半开区间语义：一个进程在它结束的那一刻已经不占名额），这样首尾相接的两次
 * 运行不会被误判成并发。
 *
 * Windows 会重复分配进程号（实测：8 路并行起 300 个短命进程，26 次拿到用过的号），
 * 单靠进程号配对会把前一个进程的结束时间和后一个的搭在一起，凭空多算出一段“还在跑”。
 * 带轨迹编号的行按编号精确配对，不受进程号复用影响；没有编号的旧格式行才退回按
 * 进程号配对（见 deltasByPidFallback）。两类行各自配对完再合到一起算峰值。
 */
export function maxConcurrency(entries: readonly TraceEntry[]): number {
  const withTraceId = entries.filter((entry) => entry.traceId !== null);
  const withoutTraceId = entries.filter((entry) => entry.traceId === null);

  const deltas: Delta[] = [...deltasByTraceId(withTraceId), ...deltasByPidFallback(withoutTraceId)];
  deltas.sort((a, b) => (a.time !== b.time ? a.time - b.time : a.delta - b.delta));

  let current = 0;
  let max = 0;
  for (const { delta } of deltas) {
    current += delta;
    max = Math.max(max, current);
  }
  return max;
}
