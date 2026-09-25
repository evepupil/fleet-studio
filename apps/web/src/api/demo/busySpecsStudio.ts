import { FLEET, queuedSpec, UISTUDIO, type WorkerSpec, workerReport } from "./records";

/**
 * 繁忙场景里 ui-studio 和 fleet-studio 的苦工。
 * ui-studio 的 3 个在跑来自第一版（原在 glm，第二版移到 glmf），另按规格补第 4 个在跑；
 * 1 个已完成的按规格改到 luna。fleet-studio 是第二版新增的项目：1 个在跑 + 1 个公共排队。
 */
export const studioSpecs: readonly WorkerSpec[] = [
  // ---- ui-studio：glmf 在跑 4 ----
  {
    id: "wz2q3r",
    project: UISTUDIO,
    pool: "glmf",
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
    pool: "glmf",
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
    pool: "glmf",
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
  // 第二版补的第 4 个 glmf 在跑（让 glmf 有 4 格占用，见 design/演示数据.md 第 2 节）
  {
    id: "wz7v8w",
    project: UISTUDIO,
    pool: "glmf",
    role: "worker",
    title: "图标：状态色的对比度",
    runs: [
      {
        status: "running",
        queuedMin: 5.1,
        startedMin: 4.8,
        activity: "read · src/components/StatusDot.tsx",
        tokens: 27_400,
        costUsd: 0.011,
      },
    ],
  },
  // ---- ui-studio：glmf 已完成 1 ----
  {
    id: "wz5t6u",
    project: UISTUDIO,
    pool: "glmf",
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
  // ---- ui-studio：luna 已完成 1（第二版从 glmf 改到 luna） ----
  {
    id: "wz6u7v",
    project: UISTUDIO,
    pool: "luna",
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
  // ---- ui-studio：公共排队 1 ----
  queuedSpec("wn8t3u", UISTUDIO, null, "worker", "给槽位表格补空态", 1.0),
  // ---- fleet-studio：luna 在跑 1 ----
  {
    id: "wk7s2t",
    project: FLEET,
    pool: "luna",
    role: "reviewer",
    title: "评审第二版调度改动",
    runs: [
      {
        status: "running",
        queuedMin: 7.3,
        startedMin: 7.0,
        activity: "read · packages/core/src/scheduling/dispatchOrder.ts",
        tokens: 18_600,
        costUsd: 0.004,
      },
    ],
  },
  // ---- fleet-studio：公共排队 1 ----
  queuedSpec("wp9u4v", FLEET, null, "scout", "查 sonner 在 Vite 下的引入方式", 2.0),
];
