import {
  type FailReason,
  type KilledBy,
  type ProjectRecord,
  piSessionIdOf,
  type RunRecord,
  runIdOf,
  type Usage,
  type WorkerRecord,
} from "@fleet/core";
import { historyId, pickWeighted, randomFloat } from "./historyRandom";
import { HISTORY_TITLES } from "./historyTitles";
import {
  CLOUD,
  DEMO_NOW_MS,
  defaultPrompt,
  FLEET,
  INFER,
  ONAHO,
  type PoolId,
  poolModelOf,
  UISTUDIO,
  WIKI,
} from "./records";

/**
 * 历史记录的编译：一次运行、一个苦工。口径见 design/演示数据.md 第 3 节，
 * 时间的推进和循环在 history.ts 里。
 */

/** 每个角色已经取到标题表的第几条，以及已经生成的苦工数 */
export interface HistoryContext {
  random: () => number;
  /** 每个角色已经取到标题表的第几条 */
  titleCursor: Record<string, number>;
  /** 已经生成的苦工数，用来算编号和标题序号 */
  count: number;
}

/** 项目、角色、池的权重（见 design/演示数据.md 第 3 节） */
const PROJECT_WEIGHTS: readonly (readonly [ProjectRecord, number])[] = [
  [WIKI, 25],
  [CLOUD, 20],
  [INFER, 15],
  [ONAHO, 10],
  [UISTUDIO, 10],
  [FLEET, 20],
];

const ROLE_WEIGHTS: readonly (readonly [string, number])[] = [
  ["worker", 45],
  ["scout", 20],
  ["reviewer", 15],
  ["fixer", 10],
  ["tester", 7],
  ["collector", 3],
];

const POOL_WEIGHTS: readonly (readonly [PoolId, number])[] = [
  ["dsf", 60],
  ["glmf", 20],
  ["luna", 12],
  ["qwen27", 8],
];

/** 一次运行的用量：输入 40k～600k、缓存读 = 输入 × 0.6～0.9、输出 2k～40k，费用 null */
function historyUsage(random: () => number, scale: number): Usage {
  const inputTokens = Math.round(randomFloat(random, 40_000, 600_000) * scale);
  const cacheReadTokens = Math.round(inputTokens * randomFloat(random, 0.6, 0.9) * scale);
  const outputTokens = Math.round(randomFloat(random, 2_000, 40_000) * scale);
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens: 0,
    totalTokens: inputTokens + outputTokens + cacheReadTokens,
    costUsd: null,
  };
}

/** 结局：已完成 82%、失败 12%（原因均匀取）、已取消 6% */
interface Outcome {
  status: "completed" | "failed" | "cancelled";
  failReason: FailReason | null;
  killedBy: KilledBy;
}

function pickOutcome(random: () => number): Outcome {
  const roll = random();
  if (roll < 0.82) {
    return { status: "completed", failReason: null, killedBy: null };
  }
  if (roll < 0.94) {
    const reasons: readonly FailReason[] = ["model_error", "timeout", "runtime_error", "exit_code"];
    const index = Math.min(reasons.length - 1, Math.floor(random() * reasons.length));
    const failReason = reasons[index];
    if (failReason === undefined) {
      throw new Error("失败原因表是空的");
    }
    return {
      status: "failed",
      failReason,
      killedBy: failReason === "timeout" ? "timeout" : null,
    };
  }
  return { status: "cancelled", failReason: null, killedBy: "cancel" };
}

/** 标题：按角色从 10 条里轮流取，再拼「 #序号」保证唯一 */
function nextTitle(ctx: HistoryContext, role: string): string {
  const table = HISTORY_TITLES[role];
  if (table === undefined || table.length === 0) {
    throw new Error(`历史标题表里没有角色：${role}`);
  }
  const cursor = ctx.titleCursor[role] ?? 0;
  const title = table[cursor % table.length];
  ctx.titleCursor[role] = cursor + 1;
  ctx.count += 1;
  if (title === undefined) {
    throw new Error("历史标题表是空的");
  }
  return `${title} #${ctx.count}`;
}

/** 偏向短的运行时长：取两个均匀随机数的较小值，再线性映射到 2 分钟～25 分钟 */
export function pickRunMs(random: () => number): number {
  return Math.round(120_000 + Math.min(random(), random()) * (1_500_000 - 120_000));
}

interface HistoryRunInput {
  seq: number;
  queuedAtMs: number;
  startedAtMs: number;
  runMs: number;
  outcome: Outcome;
}

/** 把一次运行的描述编译成 RunRecord；结束时刻按 DEMO_NOW 截断，runMs 跟着重算 */
function historyRun(
  ctx: HistoryContext,
  workerId: string,
  title: string,
  input: HistoryRunInput,
): RunRecord {
  const { seq, queuedAtMs, startedAtMs, runMs, outcome } = input;
  const endedAtMs = Math.min(startedAtMs + runMs, DEMO_NOW_MS);
  const finalText =
    outcome.status === "completed"
      ? [
          `SUMMARY: ${title} 已完成。`,
          "FILES:\n- 见任务书",
          "VERIFY: 相关单测全部通过",
          "SELF_REPORT: pass",
          "BLOCKED: 无",
        ].join("\n")
      : null;

  return {
    id: runIdOf(workerId, seq),
    workerId,
    seq,
    prompt: seq === 1 ? defaultPrompt(title) : "接着上次的结论继续，只处理没做完的部分。",
    status: outcome.status,
    failReason: outcome.failReason,
    errorMessage:
      outcome.status === "cancelled"
        ? "已被取消"
        : outcome.status === "failed"
          ? `运行失败：${outcome.failReason ?? ""}`
          : null,
    queuedAt: new Date(queuedAtMs).toISOString(),
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: new Date(endedAtMs).toISOString(),
    timeoutMs: 30 * 60_000,
    queueTimeoutMs: null,
    pid: null,
    processImage: null,
    spawnedAt: null,
    exitCode: outcome.status === "completed" ? 0 : null,
    killedBy: outcome.killedBy,
    usage: historyUsage(ctx.random, outcome.status === "cancelled" ? 0.3 : 1),
    runMs: endedAtMs - startedAtMs,
    retry: null,
    activity: null,
    lastActivityAt: new Date(endedAtMs).toISOString(),
    finalText,
    eventCount: 0,
  };
}

/** 抽一个苦工的项目、角色、池，再编译成记录 */
export function nextHistoryWorker(
  ctx: HistoryContext,
  createdAtMs: number,
): { worker: WorkerRecord; runs: RunRecord[] } {
  const project = pickWeighted(ctx.random, PROJECT_WEIGHTS);
  const role = pickWeighted(ctx.random, ROLE_WEIGHTS);
  const pool = pickWeighted(ctx.random, POOL_WEIGHTS);
  const id = historyId(ctx.count);
  const title = nextTitle(ctx, role);
  const model = poolModelOf(pool);

  const runs: RunRecord[] = [];
  const firstStart = createdAtMs + Math.round(randomFloat(ctx.random, 0, 90_000));
  runs.push(
    historyRun(ctx, id, title, {
      seq: 1,
      queuedAtMs: createdAtMs,
      startedAtMs: firstStart,
      runMs: pickRunMs(ctx.random),
      outcome: pickOutcome(ctx.random),
    }),
  );

  const firstRun = runs[0];
  if (firstRun !== undefined && firstRun.endedAt !== null && ctx.random() < 0.15) {
    const secondQueued =
      Date.parse(firstRun.endedAt) + Math.round(randomFloat(ctx.random, 60_000, 600_000));
    if (secondQueued < DEMO_NOW_MS) {
      runs.push(
        historyRun(ctx, id, title, {
          seq: 2,
          queuedAtMs: secondQueued,
          startedAtMs: secondQueued,
          runMs: pickRunMs(ctx.random),
          outcome: pickOutcome(ctx.random),
        }),
      );
    }
  }

  const worker: WorkerRecord = {
    id,
    projectKey: project.key,
    cwd: project.path,
    title,
    role,
    runtime: "pi",
    requestedPool: ctx.random() < 0.1 ? pool : null,
    poolId: pool,
    model: model.display,
    channel: model.channel,
    modelName: model.modelName,
    thinking: null,
    sessionRef: piSessionIdOf(id),
    createdAt: new Date(createdAtMs).toISOString(),
    latestRunSeq: runs.length,
  };
  return { worker, runs };
}
