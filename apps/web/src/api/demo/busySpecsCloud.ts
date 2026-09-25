import { CLOUD, INFER, ONAHO, queuedSpec, type WorkerSpec, workerReport } from "./records";

/** 繁忙场景里 CloudMind、InferForge、onaho-wiki 的苦工（第一版 busy 原样保留） */
export const cloudSpecs: readonly WorkerSpec[] = [
  // ---- CloudMind：dsf 在跑 4、排队 1、结束 3 ----
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
  queuedSpec("wq6e7f", CLOUD, "dsf", "worker", "README 首屏改写", 0.8),
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
  // ---- InferForge：dsf 在跑 2（其中 1 个在重试）、失败 1 ----
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
  // ---- onaho-wiki：dsf 在跑 1、结束 1 ----
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
    role: "scout",
    title: "侦察：竞品站信息结构",
    cwd: "C:\\Users\\zhoutao\\AppData\\Local\\Temp\\info-design\\onaho-wiki\\L0",
    runs: [
      {
        status: "completed",
        queuedMin: 70.0,
        startedMin: 69.5,
        endedMin: 50.0,
        tokens: 131_000,
        finalText:
          "FINDINGS: 4 个同类站点的信息结构，见各站页面清单\nEVIDENCE: 各站首页与导航链接\nGAPS: 无",
      },
    ],
  },
];
