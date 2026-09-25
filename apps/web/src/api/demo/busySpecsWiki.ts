import { wikiEndedSpecs } from "./busySpecsWikiEnded";
import { queuedSpec, WIKI, type WorkerSpec } from "./records";

/**
 * 繁忙场景里 wiki-forge 的苦工（第一版 busy 原样保留：编号、标题、任务书、运行、回报不变）。
 * 这里只放数据，组装见 busySpecs.ts。
 */
export const wikiSpecs: readonly WorkerSpec[] = [
  // ---- 在跑 11 个（dsf） ----
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
  // ---- 点名排队 3 个（dsf） ----
  queuedSpec("wm6p9t", WIKI, "dsf", "worker", "站点构建：静态筛选组合页", 2.0),
  queuedSpec("wn7q2u", WIKI, "dsf", "worker", "文案覆盖检查：英文词条", 1.2),
  queuedSpec("wp8r3v", WIKI, "dsf", "reviewer", "评审 M1 站点改动", 0.4),
  // ---- 公共排队 1 个（poolId 为 null，四个池字段都为空） ----
  queuedSpec("wq2v5w", WIKI, null, "worker", "补任务页的滚动加载", 4.0),
  ...wikiEndedSpecs,
];
