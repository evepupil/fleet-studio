import {
  DEFAULT_CONFIG,
  type FailReason,
  type FleetConfig,
  fleetConfigSchema,
  type ProjectRecord,
  piSessionIdOf,
  type RetryInfo,
  type RunRecord,
  type RunStatus,
  runIdOf,
  type Usage,
  type WorkerRecord,
} from "@fleet/core";

/**
 * 演示数据：给截图验收、交互检查和离线查看用。全部是编的（见 DESIGN.md 第 9 章）。
 * 所有时间都相对一个固定的「当前时刻」，截图每次结果一致。
 */

/** 演示用的固定当前时刻：+08:00 时区的 2026-09-23 12:10:00 */
export const DEMO_NOW = "2026-09-23T04:10:00.000Z";
/** 演示用的「今天零点」：+08:00 时区的 2026-09-23 00:00:00 */
export const DEMO_DAY_START = "2026-09-22T16:00:00.000Z";
const NOW_MS = Date.parse(DEMO_NOW);

/** DEMO_NOW 之前若干分钟的 ISO 时间 */
export function minutesAgo(minutes: number): string {
  return new Date(NOW_MS - Math.round(minutes * 60_000)).toISOString();
}

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
      id: "glm",
      label: "GLM 5.2",
      capacity: 8,
      runtimes: { pi: { provider: "glm", model: "glm-5.2" } },
    },
  ],
});

const POOL_MODEL: Readonly<Record<PoolId, string>> = {
  dsf: "mcgrox/deepseek-v4.1-flash",
  glm: "glm/glm-5.2",
};

type PoolId = "dsf" | "glm";

function project(path: string, colorIndex: number): ProjectRecord {
  const name = path.slice(path.lastIndexOf("\\") + 1);
  return { key: path.toLowerCase(), path, name, colorIndex, createdAt: minutesAgo(900) };
}

export const WIKI = project("C:\\code\\wiki-forge", 0);
export const CLOUD = project("C:\\code\\CloudMind", 1);
export const INFER = project("C:\\code\\InferForge", 2);
export const ONAHO = project("C:\\code\\onaho-wiki", 3);
export const UISTUDIO = project("C:\\code\\ui-studio", 4);

export const demoProjects: readonly ProjectRecord[] = [WIKI, CLOUD, INFER, ONAHO, UISTUDIO];

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
}

export interface WorkerSpec {
  id: string;
  project: ProjectRecord;
  pool: PoolId;
  role: string;
  title: string;
  /** 工作目录和项目目录不同时才写 */
  cwd?: string;
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

function defaultPrompt(title: string): string {
  return [
    `## 目标\n${title}。`,
    "## 范围\n只改任务涉及的文件，其他文件一律不准碰。",
    "## 验收\n相关单测全部通过；类型检查零报错。",
    "## 回报\n按 SUMMARY / FILES / VERIFY / SELF_REPORT / BLOCKED 格式收尾。",
  ].join("\n\n");
}

export function buildWorker(spec: WorkerSpec): { worker: WorkerRecord; runs: RunRecord[] } {
  const firstRun = spec.runs[0];
  const createdAt = minutesAgo(firstRun ? firstRun.queuedMin : 0);
  const runs = spec.runs.map((run, index): RunRecord => {
    const seq = index + 1;
    const costUsd = spec.pool === "glm" ? (run.costUsd ?? 0.004) : 0;
    return {
      id: runIdOf(spec.id, seq),
      workerId: spec.id,
      seq,
      prompt: run.prompt ?? defaultPrompt(spec.title),
      status: run.status,
      failReason: run.failReason ?? null,
      errorMessage: run.errorMessage ?? null,
      queuedAt: minutesAgo(run.queuedMin),
      startedAt: run.startedMin === undefined ? null : minutesAgo(run.startedMin),
      endedAt: run.endedMin === undefined ? null : minutesAgo(run.endedMin),
      timeoutMs: 30 * 60_000,
      queueTimeoutMs: null,
      pid: run.status === "running" ? 41000 + index : null,
      processImage: run.status === "running" ? "node.exe" : null,
      exitCode: run.status === "completed" ? 0 : null,
      killedBy: run.status === "cancelled" ? "cancel" : null,
      usage: run.status === "queued" ? usageOf(0, null) : usageOf(run.tokens ?? 24_000, costUsd),
      retry: run.retry ?? null,
      activity: run.activity ?? null,
      lastActivityAt:
        run.status === "running" && run.startedMin !== undefined
          ? minutesAgo(Math.max(0, run.startedMin - 0.5))
          : run.endedMin === undefined
            ? null
            : minutesAgo(run.endedMin),
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
    poolId: spec.pool,
    model: POOL_MODEL[spec.pool],
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

const CHANNEL_FAIL = "通道连续 8 次请求失败：Connection error.";

/** 繁忙场景：dsf 18/20（其中 1 格在重试）、排队 4；glm 3/8 */
export const busyWorkerSpecs: readonly WorkerSpec[] = [
  // ---- wiki-forge：dsf 在跑 11、排队 3 ----
  {
    id: "wk3m7p",
    project: WIKI,
    pool: "dsf",
    role: "worker",
    title: "类目配置校验：数值与区间参数",
    runs: [
      {
        status: "running",
        queuedMin: 3.6,
        startedMin: 3.2,
        activity: "bash · pnpm exec vitest run packages/schema",
        tokens: 38_400,
        eventCount: 7,
      },
    ],
  },
  {
    id: "wa2d4f",
    project: WIKI,
    pool: "dsf",
    role: "worker",
    title: "建表语句生成：多选枚举关联表",
    runs: [
      {
        status: "running",
        queuedMin: 6.1,
        startedMin: 5.8,
        activity: "edit · packages/pipeline/src/ddl/multiEnum.ts",
        tokens: 61_200,
      },
    ],
  },
  {
    id: "wb5c8h",
    project: WIKI,
    pool: "dsf",
    role: "worker",
    title: "归一化规则：单位换算表",
    runs: [
      {
        status: "running",
        queuedMin: 2.6,
        startedMin: 2.3,
        activity: "read · categories/fishing_reel/normalize.yaml",
        tokens: 18_900,
      },
    ],
  },
  {
    id: "wc6e9j",
    project: WIKI,
    pool: "dsf",
    role: "worker",
    title: "采集器：Daiwa 官方规格表接口",
    runs: [
      {
        status: "running",
        queuedMin: 7.4,
        startedMin: 7.1,
        activity: "bash · node scripts/fetch-spec.mjs --brand daiwa",
        tokens: 82_300,
      },
    ],
  },
  {
    id: "wd7f2k",
    project: WIKI,
    pool: "dsf",
    role: "worker",
    title: "抽取工单回填：Stella SW 系列",
    runs: [
      {
        status: "running",
        queuedMin: 4.9,
        startedMin: 4.4,
        activity: "write · data/tickets/stella-sw.json",
        tokens: 44_100,
      },
    ],
  },
  {
    id: "we8g3m",
    project: WIKI,
    pool: "dsf",
    role: "worker",
    title: "站点首页：型号卡片网格",
    runs: [{ status: "running", queuedMin: 1.9, startedMin: 1.6, tokens: 9_800 }],
  },
  {
    id: "wf9h4n",
    project: WIKI,
    pool: "dsf",
    role: "worker",
    title: "详情页：参数分组表",
    runs: [
      {
        status: "running",
        queuedMin: 6.3,
        startedMin: 6.0,
        activity: "edit · apps/site/src/pages/reel/[slug].astro",
        tokens: 57_600,
      },
    ],
  },
  {
    id: "wg2j5p",
    project: WIKI,
    pool: "dsf",
    role: "reviewer",
    title: "评审 M1 采集与抽取改动",
    runs: [
      {
        status: "running",
        queuedMin: 4.2,
        startedMin: 3.9,
        activity: "read · packages/collect/src/relay.ts",
        tokens: 71_000,
      },
    ],
  },
  {
    id: "wh3k6q",
    project: WIKI,
    pool: "dsf",
    role: "scout",
    title: "侦察：渔轮参数的真实取值范围",
    runs: [
      {
        status: "running",
        queuedMin: 8.8,
        startedMin: 8.5,
        activity: "fetch_content · https://www.daiwa.com/us/product/reels",
        tokens: 112_500,
      },
    ],
  },
  {
    id: "wj4m7r",
    project: WIKI,
    pool: "dsf",
    role: "tester",
    title: "测试：归一化规则的边界值",
    runs: [
      {
        status: "running",
        queuedMin: 3.1,
        startedMin: 2.9,
        activity: "write · packages/normalize/test/bounds.test.ts",
        tokens: 26_700,
      },
    ],
  },
  {
    id: "wk5n8s",
    project: WIKI,
    pool: "dsf",
    role: "fixer",
    title: "修复评审点名的 3 条缺陷",
    runs: [
      {
        status: "running",
        queuedMin: 1.3,
        startedMin: 1.1,
        activity: "read · packages/schema/src/validate.ts",
        tokens: 7_300,
      },
    ],
  },
  {
    id: "wm6p9t",
    project: WIKI,
    pool: "dsf",
    role: "worker",
    title: "站点构建：静态筛选组合页",
    runs: [{ status: "queued", queuedMin: 2.0 }],
  },
  {
    id: "wn7q2u",
    project: WIKI,
    pool: "dsf",
    role: "worker",
    title: "文案覆盖检查：英文词条",
    runs: [{ status: "queued", queuedMin: 1.2 }],
  },
  {
    id: "wp8r3v",
    project: WIKI,
    pool: "dsf",
    role: "reviewer",
    title: "评审 M1 站点改动",
    runs: [{ status: "queued", queuedMin: 0.4 }],
  },
  // ---- wiki-forge：最近结束 ----
  {
    id: "wr8v2k",
    project: WIKI,
    pool: "dsf",
    role: "reviewer",
    title: "评审 M0 核心层改动",
    runs: [
      {
        status: "completed",
        queuedMin: 16.5,
        startedMin: 16.2,
        endedMin: 9.0,
        tokens: 96_400,
        eventCount: 20,
        finalText:
          "VERDICT: fail\nISSUES:\n[P2] packages/core/src/projects/path.ts:21 — UNC 路径缺 share 段时末尾分隔符没去掉 — 输入 \\\\server\\ 得到 \\\\server\\，与 \\\\server 不一致",
      },
      {
        status: "completed",
        queuedMin: 4.0,
        startedMin: 3.8,
        endedMin: 1.5,
        prompt: "只复查上次点名的 UNC 路径问题，修复已经提交，确认后给出结论。",
        tokens: 31_200,
        eventCount: 6,
        finalText: [
          "SUMMARY: 复查 UNC 路径归一化：缺 share 段时末尾分隔符已去掉，带 share 的路径行为不变。",
          "FILES:\n- packages/core/src/projects/path.ts（只读核对）\n- packages/core/test/projects/path.test.ts（只读核对）",
          "VERIFY: pnpm exec vitest run packages/core/test/projects，21 个测试全部通过",
          "VERDICT: pass",
          "ISSUES: 无",
        ].join("\n"),
      },
    ],
  },
  {
    id: "ws9w4x",
    project: WIKI,
    pool: "dsf",
    role: "worker",
    title: "类目配置：渔轮 14 个参数",
    runs: [
      {
        status: "completed",
        queuedMin: 19.0,
        startedMin: 18.7,
        endedMin: 6.0,
        tokens: 143_800,
        finalText: workerReport(
          "渔轮类目 14 个参数落盘，覆盖五种参数类型。",
          "- categories/fishing_reel/category.yaml\n- categories/fishing_reel/i18n/zh.yaml",
          "pnpm test，125 个通过",
          "pass",
          "无",
        ),
      },
    ],
  },
  {
    id: "wt2x5y",
    project: WIKI,
    pool: "dsf",
    role: "worker",
    title: "产品唯一键约束",
    runs: [
      {
        status: "completed",
        queuedMin: 14.2,
        startedMin: 13.9,
        endedMin: 8.0,
        tokens: 52_100,
        finalText: workerReport(
          "唯一键两个字段的校验已加上，但配置里允许同名字段的情况还没想清楚。",
          "- packages/schema/src/validate.ts",
          "pnpm test，119 个通过，1 个跳过",
          "fail",
          "唯一键两个字段填成同一个时是否直接报错，需要主会话确认",
        ),
      },
    ],
  },
  {
    id: "wu3y6z",
    project: WIKI,
    pool: "dsf",
    role: "worker",
    title: "中继服务令牌校验",
    runs: [
      {
        status: "failed",
        queuedMin: 7.5,
        startedMin: 7.2,
        endedMin: 4.0,
        failReason: "model_error",
        errorMessage: CHANNEL_FAIL,
        tokens: 3_100,
        eventCount: 16,
      },
    ],
  },
  {
    id: "wv4z7a",
    project: WIKI,
    pool: "dsf",
    role: "worker",
    title: "旧版站点清理",
    runs: [
      {
        status: "cancelled",
        queuedMin: 30.0,
        startedMin: 29.6,
        endedMin: 12.0,
        errorMessage: "已被取消",
        tokens: 12_600,
      },
    ],
  },
  // ---- CloudMind：dsf 在跑 4、排队 1 ----
  {
    id: "wq2a3b",
    project: CLOUD,
    pool: "dsf",
    role: "worker",
    title: "资产向量化：分块策略",
    runs: [
      {
        status: "running",
        queuedMin: 10.2,
        startedMin: 9.8,
        activity: "bash · pnpm exec vitest run test/chunking",
        tokens: 88_900,
      },
    ],
  },
  {
    id: "wq3b4c",
    project: CLOUD,
    pool: "dsf",
    role: "worker",
    title: "记忆召回：时间范围过滤",
    runs: [
      {
        status: "running",
        queuedMin: 3.6,
        startedMin: 3.3,
        activity: "edit · src/recall/timeRange.ts",
        tokens: 29_400,
      },
    ],
  },
  {
    id: "wq4c5d",
    project: CLOUD,
    pool: "dsf",
    role: "reviewer",
    title: "评审：删除接口的权限校验",
    runs: [
      {
        status: "running",
        queuedMin: 2.3,
        startedMin: 2.0,
        activity: "read · src/routes/memory/delete.ts",
        tokens: 21_800,
      },
    ],
  },
  {
    id: "wq5d6e",
    project: CLOUD,
    pool: "dsf",
    role: "scout",
    title: "侦察：Vectorize 批量写入限制",
    runs: [
      {
        status: "running",
        queuedMin: 5.8,
        startedMin: 5.5,
        activity: "web_search · cloudflare vectorize upsert batch limit",
        tokens: 64_300,
      },
    ],
  },
  {
    id: "wq6e7f",
    project: CLOUD,
    pool: "dsf",
    role: "worker",
    title: "README 首屏改写",
    runs: [{ status: "queued", queuedMin: 0.8 }],
  },
  {
    id: "wq7f8g",
    project: CLOUD,
    pool: "dsf",
    role: "worker",
    title: "迁移脚本：添加 recordKinds 列",
    runs: [
      {
        status: "completed",
        queuedMin: 13.0,
        startedMin: 12.6,
        endedMin: 7.0,
        tokens: 40_700,
        finalText: workerReport(
          "新增迁移脚本，给记忆表加 recordKinds 列并回填旧数据。",
          "- migrations/0014_record_kinds.sql\n- src/db/schema.ts",
          "pnpm test，212 个通过",
          "pass",
          "无",
        ),
      },
    ],
  },
  {
    id: "wq8g9h",
    project: CLOUD,
    pool: "dsf",
    role: "fixer",
    title: "修复 recall 空结果",
    runs: [
      {
        status: "completed",
        queuedMin: 41.0,
        startedMin: 40.5,
        endedMin: 30.0,
        tokens: 22_900,
        finalText: workerReport(
          "召回在过滤后为空时返回空数组而不是报错。",
          "- src/recall/index.ts",
          "pnpm test，211 个通过",
          "pass",
          "无",
        ),
      },
    ],
  },
  {
    id: "wq9h2j",
    project: CLOUD,
    pool: "dsf",
    role: "scout",
    title: "排查队列积压",
    runs: [
      {
        status: "cancelled",
        queuedMin: 60.0,
        startedMin: 59.5,
        endedMin: 45.0,
        errorMessage: "已被取消",
        tokens: 35_000,
      },
    ],
  },
  // ---- InferForge：dsf 在跑 2（其中 1 个在重试） ----
  {
    id: "wx2j3k",
    project: INFER,
    pool: "dsf",
    role: "worker",
    title: "Fake 后端：取消的上下文检查",
    runs: [
      {
        status: "running",
        queuedMin: 4.3,
        startedMin: 4.0,
        activity: "read · engine/internal/backend/fake/backend.go",
        retry: { attempt: 3, max: 8, message: "Connection error." },
        tokens: 16_200,
        eventCount: 7,
      },
    ],
  },
  {
    id: "wx3k4m",
    project: INFER,
    pool: "dsf",
    role: "worker",
    title: "内存存储：锁等待期间的取消",
    runs: [
      {
        status: "running",
        queuedMin: 6.9,
        startedMin: 6.6,
        activity: "bash · go test ./engine/internal/store/memory/...",
        tokens: 58_800,
      },
    ],
  },
  {
    id: "wx4m5n",
    project: INFER,
    pool: "dsf",
    role: "worker",
    title: "Model Catalog 校验器超时",
    runs: [
      {
        status: "failed",
        queuedMin: 33.5,
        startedMin: 33.0,
        endedMin: 3.0,
        failReason: "timeout",
        errorMessage: "运行超过 30 分钟被结束",
        tokens: 204_000,
      },
    ],
  },
  // ---- onaho-wiki：dsf 在跑 1 ----
  {
    id: "wy2n3p",
    project: ONAHO,
    pool: "dsf",
    role: "worker",
    title: "条目页：参数对比表",
    runs: [
      {
        status: "running",
        queuedMin: 2.8,
        startedMin: 2.5,
        activity: "edit · src/pages/compare.tsx",
        tokens: 19_500,
      },
    ],
  },
  {
    id: "wy3p4q",
    project: ONAHO,
    pool: "dsf",
    role: "ia-scout",
    title: "侦察：竞品站信息结构",
    cwd: "C:\\Users\\zhoutao\\AppData\\Local\\Temp\\info-design\\onaho-wiki\\L0",
    runs: [
      {
        status: "completed",
        queuedMin: 70.0,
        startedMin: 69.5,
        endedMin: 50.0,
        tokens: 131_000,
        finalText: "SITES: 4 个同类站点\nPAGES: 见各站页面清单\nGAPS: 无",
      },
    ],
  },
  // ---- ui-studio：glm 在跑 3 ----
  {
    id: "wz2q3r",
    project: UISTUDIO,
    pool: "glm",
    role: "worker",
    title: "组件库：按钮六态",
    runs: [
      {
        status: "running",
        queuedMin: 2.2,
        startedMin: 1.9,
        activity: "edit · src/components/Button.tsx",
        tokens: 14_800,
        costUsd: 0.006,
      },
    ],
  },
  {
    id: "wz3r4s",
    project: UISTUDIO,
    pool: "glm",
    role: "worker",
    title: "令牌：暗色主题色阶",
    runs: [
      {
        status: "running",
        queuedMin: 4.5,
        startedMin: 4.2,
        activity: "write · src/styles/tokens.css",
        tokens: 33_100,
        costUsd: 0.013,
      },
    ],
  },
  {
    id: "wz4s5t",
    project: UISTUDIO,
    pool: "glm",
    role: "reviewer",
    title: "评审：表单组件可访问性",
    runs: [
      {
        status: "running",
        queuedMin: 3.3,
        startedMin: 3.0,
        activity: "read · src/components/Field.tsx",
        tokens: 25_600,
        costUsd: 0.01,
      },
    ],
  },
  {
    id: "wz5t6u",
    project: UISTUDIO,
    pool: "glm",
    role: "scout",
    title: "图标白名单核对",
    runs: [
      {
        status: "completed",
        queuedMin: 26.0,
        startedMin: 25.5,
        endedMin: 20.0,
        tokens: 12_300,
        costUsd: 0.005,
        finalText: "FINDINGS: 34 个图标全部存在\nEVIDENCE: node_modules/lucide-react\nGAPS: 无",
      },
    ],
  },
  {
    id: "wz6u7v",
    project: UISTUDIO,
    pool: "glm",
    role: "worker",
    title: "布局：响应式断点",
    runs: [
      {
        status: "completed",
        queuedMin: 18.0,
        startedMin: 17.6,
        endedMin: 9.0,
        tokens: 47_900,
        costUsd: 0.019,
        finalText: workerReport(
          "四档断点落地，窄屏改单栏。",
          "- src/styles/layout.css",
          "pnpm build 通过",
          "pass",
          "无",
        ),
      },
    ],
  },
];

/** 故障场景：通道持续报错，dsf 的 6 个在跑苦工全部在重试、9 个在 10 分钟内失败、10 个排队 */
export function failureWorkerSpecs(): WorkerSpec[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz";
  const id = (prefix: string, index: number): string => {
    const letter = alphabet[index % alphabet.length] ?? "a";
    const second = alphabet[(index * 7 + 3) % alphabet.length] ?? "b";
    return `w${prefix}${letter}${2 + (index % 8)}${second}${3 + (index % 7)}`;
  };
  const projects = [WIKI, CLOUD, INFER];
  const specs: WorkerSpec[] = [];
  for (let index = 0; index < 6; index += 1) {
    specs.push({
      id: id("f", index),
      project: projects[index % 3] ?? WIKI,
      pool: "dsf",
      role: "worker",
      title: `通道故障中的任务 ${index + 1}`,
      runs: [
        {
          status: "running",
          queuedMin: 6 + index,
          startedMin: 5 + index,
          retry: { attempt: 2 + (index % 6), max: 8, message: "Connection error." },
          tokens: 1_200,
        },
      ],
    });
  }
  for (let index = 0; index < 9; index += 1) {
    specs.push({
      id: id("g", index),
      project: projects[index % 3] ?? WIKI,
      pool: "dsf",
      role: index % 4 === 0 ? "reviewer" : "worker",
      title: `通道故障前派出的任务 ${index + 1}`,
      runs: [
        {
          status: "failed",
          queuedMin: 12 + index,
          startedMin: 11 + index,
          endedMin: 1 + index * 0.9,
          failReason: "model_error",
          errorMessage: CHANNEL_FAIL,
          tokens: 800,
        },
      ],
    });
  }
  for (let index = 0; index < 10; index += 1) {
    specs.push({
      id: id("h", index),
      project: projects[index % 3] ?? WIKI,
      pool: "dsf",
      role: "worker",
      title: `排队等待的任务 ${index + 1}`,
      runs: [{ status: "queued", queuedMin: 5 - index * 0.4 }],
    });
  }
  specs.push({
    id: "wz2q3r",
    project: UISTUDIO,
    pool: "glm",
    role: "worker",
    title: "组件库：按钮六态",
    runs: [
      {
        status: "running",
        queuedMin: 2.2,
        startedMin: 1.9,
        activity: "edit · src/components/Button.tsx",
        tokens: 14_800,
        costUsd: 0.006,
      },
    ],
  });
  return specs;
}

export const FAILURE_CONFIG_ERROR = "pools.1.capacity: Too big: expected number to be <=500";
