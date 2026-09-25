import type { StatsDimension } from "../../src/api/requests.js";
import type { ComputeStatsInput, RunFact, StatsLabels, WorkerFact } from "../../src/stats/index.js";
import { fixedTimeZone } from "./timezones.js";

/**
 * computeStats 的主用例数据：东八区，now = 本地 2026-09-25 14:30。
 * 3 个有任务的项目 + 1 个只有任务没跑过的项目，10 个模型各一次运行，
 * 外加一次还在跑的运行、一次跨本地零点的运行、同一个任务的第二次运行。
 */

export const TZ_8 = fixedTimeZone(480);
export const NOW = Date.parse("2026-09-25T06:30:00Z");
/** 本地 2026-09-19 00:00（7d 的起点） */
export const WEEK_START = Date.parse("2026-09-18T16:00:00Z");
/** 本地 2026-09-25 00:00（今天的起点） */
export const TODAY_START = Date.parse("2026-09-24T16:00:00Z");

interface RunSeed {
  runId: string;
  workerId: string;
  startedAt: string;
  endedAt?: string | null;
  runMs?: number | null;
  tokens: number;
  costUsd?: number | null;
}

interface WorkerSeed {
  workerId: string;
  createdAt: string;
  projectKey: string;
  role: string;
  channel?: string | null;
  modelName?: string | null;
}

const WORKER_SEEDS: readonly WorkerSeed[] = [
  {
    workerId: "w1",
    createdAt: "2026-09-19T02:00:00Z",
    projectKey: "p1",
    role: "r1",
    channel: "cA",
    modelName: "m1",
  },
  {
    workerId: "w2",
    createdAt: "2026-09-19T03:00:00Z",
    projectKey: "p1",
    role: "r1",
    channel: "cA",
    modelName: "m2",
  },
  {
    workerId: "w3",
    createdAt: "2026-09-20T02:00:00Z",
    projectKey: "p2",
    role: "r2",
    channel: "cB",
    modelName: "m3",
  },
  {
    workerId: "w4",
    createdAt: "2026-09-21T02:00:00Z",
    projectKey: "p2",
    role: "r2",
    channel: "cB",
    modelName: "m4",
  },
  {
    workerId: "w5",
    createdAt: "2026-09-22T02:00:00Z",
    projectKey: "p3",
    role: "r3",
    channel: "cC",
    modelName: "m5",
  },
  {
    workerId: "w6",
    createdAt: "2026-09-22T03:00:00Z",
    projectKey: "p3",
    role: "r3",
    channel: "cC",
    modelName: "m6",
  },
  {
    workerId: "w7",
    createdAt: "2026-09-23T02:00:00Z",
    projectKey: "p1",
    role: "r1",
    channel: "cA",
    modelName: "m7",
  },
  {
    workerId: "w8",
    createdAt: "2026-09-24T02:00:00Z",
    projectKey: "p2",
    role: "r2",
    channel: "cB",
    modelName: "m8",
  },
  {
    workerId: "w9",
    createdAt: "2026-09-25T01:00:00Z",
    projectKey: "p3",
    role: "r3",
    channel: "cC",
    modelName: "m9",
  },
  {
    workerId: "w10",
    createdAt: "2026-09-25T02:00:00Z",
    projectKey: "p1",
    role: "r1",
    channel: "cA",
    modelName: "m10",
  },
  {
    workerId: "w11",
    createdAt: "2026-09-25T03:00:00Z",
    projectKey: "p2",
    role: "r2",
    channel: "cB",
    modelName: "m1",
  },
  // w12 一次都没跑过：平均耗时的分母不该数它；w13 属于没配过名字的项目 p4。
  {
    workerId: "w12",
    createdAt: "2026-09-25T04:00:00Z",
    projectKey: "p3",
    role: "r3",
    channel: "cC",
    modelName: "m2",
  },
  {
    workerId: "w13",
    createdAt: "2026-09-25T05:00:00Z",
    projectKey: "p4",
    role: "r1",
    channel: "cA",
    modelName: "m3",
  },
];

const RUN_SEEDS: readonly RunSeed[] = [
  {
    runId: "r1",
    workerId: "w1",
    startedAt: "2026-09-19T05:00:00Z",
    runMs: 1_000,
    tokens: 1_000,
    costUsd: 0.5,
  },
  {
    runId: "r2",
    workerId: "w2",
    startedAt: "2026-09-20T05:00:00Z",
    runMs: 2_000,
    tokens: 900,
    costUsd: 0.5,
  },
  {
    runId: "r3",
    workerId: "w3",
    startedAt: "2026-09-21T05:00:00Z",
    runMs: 3_000,
    tokens: 800,
    costUsd: 0.5,
  },
  // 跨本地零点：本地 09-22 23:00 开跑，跑到本地 09-23 02:00，仍归到 09-22 那段。
  {
    runId: "r4",
    workerId: "w4",
    startedAt: "2026-09-22T15:00:00Z",
    runMs: 10_800_000,
    tokens: 700,
    costUsd: 0.5,
  },
  {
    runId: "r5",
    workerId: "w5",
    startedAt: "2026-09-23T05:00:00Z",
    runMs: 5_000,
    tokens: 600,
    costUsd: 0.5,
  },
  {
    runId: "r6",
    workerId: "w6",
    startedAt: "2026-09-23T06:00:00Z",
    runMs: 6_000,
    tokens: 500,
    costUsd: 0.5,
  },
  {
    runId: "r7",
    workerId: "w7",
    startedAt: "2026-09-24T05:00:00Z",
    runMs: 7_000,
    tokens: 400,
    costUsd: 0.5,
  },
  {
    runId: "r8",
    workerId: "w8",
    startedAt: "2026-09-24T06:00:00Z",
    runMs: 8_000,
    tokens: 300,
    costUsd: 0.5,
  },
  {
    runId: "r9",
    workerId: "w9",
    startedAt: "2026-09-25T01:30:00Z",
    runMs: 9_000,
    tokens: 200,
    costUsd: 0.5,
  },
  {
    runId: "r10",
    workerId: "w10",
    startedAt: "2026-09-25T02:30:00Z",
    runMs: 10_000,
    tokens: 100,
    costUsd: 0.5,
  },
  // 还在跑：耗时算到 nowMs（本地 14:30 − 本地 13:00 = 90 分钟）；费用没报，是 null。
  {
    runId: "r11",
    workerId: "w11",
    startedAt: "2026-09-25T05:00:00Z",
    runMs: null,
    tokens: 50,
    costUsd: null,
  },
  // 同一个任务 w1 的第二次运行。
  {
    runId: "r12",
    workerId: "w1",
    startedAt: "2026-09-25T05:30:00Z",
    runMs: 1_500,
    tokens: 25,
    costUsd: 0.5,
  },
];

export function mainWorkers(): WorkerFact[] {
  return WORKER_SEEDS.map((seed) => ({
    workerId: seed.workerId,
    createdAt: seed.createdAt,
    projectKey: seed.projectKey,
    role: seed.role,
    channel: seed.channel ?? null,
    modelName: seed.modelName ?? null,
  }));
}

export function mainRuns(): RunFact[] {
  return RUN_SEEDS.map((seed) => ({
    runId: seed.runId,
    workerId: seed.workerId,
    startedAt: seed.startedAt,
    endedAt: seed.endedAt ?? null,
    runMs: seed.runMs ?? null,
    inputTokens: seed.tokens,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: seed.tokens,
    costUsd: seed.costUsd === undefined ? 0.5 : seed.costUsd,
  }));
}

/** 测试里要额外加一条运行时的模板（w1 的一次运行） */
export function templateRun(): RunFact {
  return {
    runId: "template-run",
    workerId: "w1",
    startedAt: "2026-09-25T05:00:00Z",
    endedAt: null,
    runMs: 1_000,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    costUsd: 0,
  };
}

/** 测试里要额外加一个任务时的模板（属于 p1 / r1 / cA / m1） */
export function templateWorker(): WorkerFact {
  return {
    workerId: "template-worker",
    createdAt: "2026-09-25T05:00:00Z",
    projectKey: "p1",
    role: "r1",
    channel: "cA",
    modelName: "m1",
  };
}

/** 记录 seriesColor 被哪些 (dimension, key) 调过 */
export interface RecordingLabels extends StatsLabels {
  readonly seriesCalls: readonly (readonly [Exclude<StatsDimension, "project">, string])[];
}

const SERIES_COLORS: Readonly<Record<string, number>> = {
  m1: 0,
  m2: 1,
  m3: 2,
  m4: 3,
  m5: 4,
  m6: 5,
  m7: 6,
  m8: 7,
  m9: 0,
  m10: 1,
};

export function mainLabels(): RecordingLabels {
  const seriesCalls: [Exclude<StatsDimension, "project">, string][] = [];
  return {
    projectName: new Map([
      ["p1", "项目一"],
      ["p2", "项目二"],
      ["p3", "项目三"],
    ]),
    projectColor: new Map([
      ["p1", 1],
      ["p2", 2],
      ["p3", 3],
    ]),
    roleLabel: new Map([
      ["r1", "写手"],
      ["r2", "审稿"],
      ["r3", "研究员"],
    ]),
    seriesColor: (dimension, key) => {
      seriesCalls.push([dimension, key]);
      return SERIES_COLORS[key] ?? 0;
    },
    seriesCalls,
  };
}

export function mainInput(overrides: Partial<ComputeStatsInput> = {}): ComputeStatsInput {
  return {
    range: { kind: "7d" },
    dimension: "model",
    nowMs: NOW,
    tz: TZ_8,
    runs: mainRuns(),
    workers: mainWorkers(),
    labels: mainLabels(),
    ...overrides,
  };
}

/** 主用例里 7d 的 7 个本地日分段（UTC 毫秒） */
export const MAIN_BUCKETS: readonly number[] = [
  Date.parse("2026-09-18T16:00:00Z"),
  Date.parse("2026-09-19T16:00:00Z"),
  Date.parse("2026-09-20T16:00:00Z"),
  Date.parse("2026-09-21T16:00:00Z"),
  Date.parse("2026-09-22T16:00:00Z"),
  Date.parse("2026-09-23T16:00:00Z"),
  Date.parse("2026-09-24T16:00:00Z"),
];
