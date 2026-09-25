import {
  DEFAULT_CONFIG,
  type FailReason,
  type FleetConfig,
  fleetConfigSchema,
  type KilledBy,
  type PoolChannelModel,
  type ProjectRecord,
  piSessionIdOf,
  poolChannelModel,
  type RetryInfo,
  type RunRecord,
  type RunStatus,
  runIdOf,
  type TimeZone,
  type Usage,
  type WorkerRecord,
} from "@fleet/core";

/**
 * 演示数据的公共底座：固定时刻、时区、四个模型池、六个项目，以及把「几分钟前」的
 * 描述编译成完整记录的工具。全部是编的（见 DESIGN.md 第 9 章）。
 * 所有时间都相对一个固定的「当前时刻」，截图和交互检查每次结果一致。
 */

/** 演示用的固定当前时刻：+08:00 时区的 2026-09-23 12:10:00 */
export const DEMO_NOW = "2026-09-23T04:10:00.000Z";
export const DEMO_NOW_MS = Date.parse(DEMO_NOW);
/** 演示用的「今天零点」：+08:00 时区的 2026-09-23 00:00:00（第一版遗留，第二版按传入时区算） */
export const DEMO_DAY_START = "2026-09-22T16:00:00.000Z";

/** DEMO_NOW 之前若干分钟的 ISO 时间 */
export function minutesAgo(minutes: number): string {
  return new Date(DEMO_NOW_MS - Math.round(minutes * 60_000)).toISOString();
}

/**
 * 浏览器时区。演示源在浏览器里跑，本地时间的对齐要跟随访问者所在的时区；
 * 单测里传固定的 +480（见 scenarios.ts 的参数）。
 */
export const browserTimeZone: TimeZone = {
  offsetMinutes: (ms: number): number => -new Date(ms).getTimezoneOffset(),
};

/** 演示配置里的池编号，顺序就是派活优先级 */
export type PoolId = "dsf" | "glmf" | "qwen27" | "luna";

/**
 * 演示配置：四个池，顺序即优先级（见 design/演示数据.md 第 1 节）。
 * 角色沿用 @fleet/core 的 DEFAULT_CONFIG.roles（实现、侦察、评审、修复、测试、收集）。
 */
export const demoConfig: FleetConfig = fleetConfigSchema.parse({
  ...DEFAULT_CONFIG,
  pools: [
    {
      id: "dsf",
      label: "DeepSeek V4.1 Flash",
      capacity: 20,
      runtimes: {
        pi: { provider: "mcgrox", model: "deepseek-v4.1-flash" },
        opencode: { model: "mcgrox/deepseek-v4.1-flash" },
      },
    },
    {
      id: "glmf",
      label: "GLM-5.3 Flash",
      capacity: 7,
      runtimes: {
        pi: { provider: "chaosyn", model: "GLM-5.3-Flash" },
        opencode: { model: "chaosyn/GLM-5.3-Flash" },
      },
    },
    {
      id: "qwen27",
      label: "Qwen3.8 27B",
      capacity: 5,
      runtimes: {
        pi: { provider: "snow", model: "qwen3.8-27b" },
        opencode: { model: "snow/qwen3.8-27b" },
      },
    },
    {
      id: "luna",
      label: "GPT-6 Luna",
      capacity: 8,
      runtimes: {
        pi: { provider: "manyrouter", model: "gpt-6-luna" },
        opencode: { model: "manyrouter/gpt-6-luna" },
      },
    },
  ],
});

/** 池在演示配置里的渠道、模型名和显示名；配置里找不到就抛错（演示数据自己写错了要立刻发现） */
export function poolModelOf(poolId: PoolId): PoolChannelModel {
  const pool = demoConfig.pools.find((item) => item.id === poolId);
  if (pool === undefined) {
    throw new Error(`演示配置里没有池：${poolId}`);
  }
  const info = poolChannelModel(pool);
  if (info === null) {
    throw new Error(`演示配置里的池没有模型：${poolId}`);
  }
  return info;
}

function project(path: string, colorIndex: number): ProjectRecord {
  const name = path.slice(path.lastIndexOf("\\") + 1);
  return { key: path.toLowerCase(), path, name, colorIndex, createdAt: minutesAgo(900) };
}

export const WIKI = project("C:\\code\\wiki-forge", 0);
export const CLOUD = project("C:\\code\\CloudMind", 1);
export const INFER = project("C:\\code\\InferForge", 2);
export const ONAHO = project("C:\\code\\onaho-wiki", 3);
export const UISTUDIO = project("C:\\code\\ui-studio", 4);
export const FLEET = project("C:\\code\\fleet-studio", 5);

export const demoProjects: readonly ProjectRecord[] = [WIKI, CLOUD, INFER, ONAHO, UISTUDIO, FLEET];

/** 一次运行的描述：时间都用「几分钟前」 */
export interface RunSpec {
  status: RunStatus;
  queuedMin: number;
  startedMin?: number;
  endedMin?: number;
  prompt?: string;
  activity?: string;
  retry?: RetryInfo;
  failReason?: FailReason;
  errorMessage?: string;
  finalText?: string;
  tokens?: number;
  costUsd?: number;
  eventCount?: number;
  killedBy?: KilledBy;
}

export interface WorkerSpec {
  id: string;
  project: ProjectRecord;
  /** null 表示还没被放行过，在公共排队里（poolId / model / channel / modelName 全为 null） */
  pool: PoolId | null;
  role: string;
  title: string;
  /** 工作目录和项目目录不同时才写 */
  cwd?: string;
  /** 点名了哪个池；不点名（含公共排队）为 null */
  requestedPool?: string | null;
  runs: readonly RunSpec[];
}

/** 用量：输入约占七成、其中大半命中缓存，接近 pi 真实抓包的形状 */
function usageOf(tokens: number, costUsd: number | null): Usage {
  const input = Math.round(tokens * 0.7);
  const output = tokens - input;
  return {
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: Math.round(input * 0.6),
    cacheWriteTokens: 0,
    totalTokens: tokens,
    costUsd,
  };
}

/** 演示用的默认任务书模板，和第一版一致 */
export function defaultPrompt(title: string): string {
  return [
    `## 目标\n${title}。`,
    "## 范围\n只改任务涉及的文件，其他文件一律不准碰。",
    "## 验收\n相关单测全部通过；类型检查零报错。",
    "## 回报\n按 SUMMARY / FILES / VERIFY / SELF_REPORT / BLOCKED 格式收尾。",
  ].join("\n\n");
}

/** 把一份「几分钟前」的描述编译成苦工记录和它的全部运行记录 */
export function buildWorker(spec: WorkerSpec): { worker: WorkerRecord; runs: RunRecord[] } {
  const firstRun = spec.runs[0];
  const createdAt = minutesAgo(firstRun ? firstRun.queuedMin : 0);
  const model = spec.pool === null ? null : poolModelOf(spec.pool);
  // 池没写费用时按第一版口径补：dsf 免费，其余池每次运行 0.004 美元。
  const fallbackCostUsd = spec.pool === "dsf" || spec.pool === null ? 0 : 0.004;

  const runs = spec.runs.map((run, index): RunRecord => {
    const seq = index + 1;
    const startedAt = run.startedMin === undefined ? null : minutesAgo(run.startedMin);
    const endedAt = run.endedMin === undefined ? null : minutesAgo(run.endedMin);
    // 已结束的运行：真正在跑的毫秒数就是结束减开跑（第二版记录形状要求）。
    const runMs =
      startedAt !== null && endedAt !== null ? Date.parse(endedAt) - Date.parse(startedAt) : null;
    const running = run.status === "running";
    return {
      id: runIdOf(spec.id, seq),
      workerId: spec.id,
      seq,
      prompt: run.prompt ?? defaultPrompt(spec.title),
      status: run.status,
      failReason: run.failReason ?? null,
      errorMessage: run.errorMessage ?? null,
      queuedAt: minutesAgo(run.queuedMin),
      startedAt,
      endedAt,
      timeoutMs: 30 * 60_000,
      queueTimeoutMs: null,
      pid: running ? 41000 + index : null,
      processImage: running ? "node.exe" : null,
      spawnedAt: running ? startedAt : null,
      exitCode: run.status === "completed" ? 0 : null,
      killedBy: run.killedBy ?? (run.status === "cancelled" ? "cancel" : null),
      usage:
        run.status === "queued"
          ? usageOf(0, null)
          : usageOf(run.tokens ?? 24_000, run.costUsd ?? fallbackCostUsd),
      runMs,
      retry: run.retry ?? null,
      activity: run.activity ?? null,
      lastActivityAt:
        endedAt ??
        (running && run.startedMin !== undefined
          ? minutesAgo(Math.max(0, run.startedMin - 0.5))
          : null),
      finalText: run.finalText ?? null,
      eventCount: run.eventCount ?? 0,
    };
  });

  const worker: WorkerRecord = {
    id: spec.id,
    projectKey: spec.project.key,
    cwd: spec.cwd ?? spec.project.path,
    title: spec.title,
    role: spec.role,
    runtime: "pi",
    requestedPool: spec.requestedPool ?? null,
    poolId: spec.pool,
    model: model?.display ?? null,
    channel: model?.channel ?? null,
    modelName: model?.modelName ?? null,
    thinking: null,
    sessionRef: piSessionIdOf(spec.id),
    createdAt,
    latestRunSeq: runs.length,
  };
  return { worker, runs };
}

/** 回报原文：按 pi-fleet 实现角色的固定格式 */
function workerReport(
  summary: string,
  files: string,
  verify: string,
  verdict: "pass" | "fail",
  blocked: string,
): string {
  return [
    `SUMMARY: ${summary}`,
    `FILES:\n${files}`,
    `VERIFY: ${verify}`,
    `SELF_REPORT: ${verdict}`,
    `BLOCKED: ${blocked}`,
  ].join("\n");
}

export const CHANNEL_FAIL = "通道连续 8 次请求失败：Connection error.";

export { workerReport };

/** 故障场景用的配置错误文案，第一版那句 */
export const FAILURE_CONFIG_ERROR = "pools.1.capacity: Too big: expected number to be <=500";

/** 造一个「排队中」的苦工（只有第 1 次运行） */
export function queuedSpec(
  id: string,
  project: ProjectRecord,
  pool: PoolId | null,
  role: string,
  title: string,
  queuedMin: number,
): WorkerSpec {
  return { id, project, pool, role, title, runs: [{ status: "queued", queuedMin }] };
}
