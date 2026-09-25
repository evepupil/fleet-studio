import { CHANNEL_FAIL, WIKI, type WorkerSpec, workerReport } from "./records";

/** 繁忙场景里 wiki-forge 最近结束的 5 个苦工（第一版 busy 原样保留） */
export const wikiEndedSpecs: readonly WorkerSpec[] = [
  // ---- 最近结束 5 个（dsf） ----
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
];
