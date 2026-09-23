import type { FleetConfigInput } from "./schema.js";

/**
 * 角色提示词路径里的 builtin: 前缀，指向 fleet-studio 仓库根目录（区别于 ~ 指向的用户目录）。
 * 展开规则见 lookup.ts 的 expandPath。
 */
export const BUILTIN_PREFIX = "builtin:";

/** 「无联网」：屏蔽联网检索类工具。 */
const NO_NETWORK_TOOLS = ["web_search", "get_search_content", "source_check"];

/** 「只读无联网」：在无联网基础上再屏蔽写文件类工具。 */
const READONLY_NO_NETWORK_TOOLS = [
  "write",
  "edit",
  "web_search",
  "get_search_content",
  "source_check",
  "fetch_content",
];

/**
 * 首次启动时写进 config.json 的默认配置。
 * 池选用 DeepSeek V4.1 Flash（走 mcgrox 通道）；角色覆盖 fleet-build / pi-fleet 常见的分工。
 */
export const DEFAULT_CONFIG: FleetConfigInput = {
  version: 1,
  port: 4870,
  retentionDays: 7,
  snapshotWindowHours: 24,
  defaults: {
    pool: "dsf",
    runtime: "pi",
    role: "worker",
    runTimeoutMin: 30,
    queueTimeoutMin: null,
    thinking: null,
  },
  pools: [
    {
      id: "dsf",
      label: "DeepSeek V4.1 Flash",
      capacity: 20,
      perProjectCap: null,
      runTimeoutMin: null,
      queueTimeoutMin: null,
      runtimes: {
        pi: { provider: "mcgrox", model: "deepseek-v4.1-flash" },
        opencode: { model: "mcgrox/deepseek-v4.1-flash" },
      },
    },
  ],
  roles: [
    {
      id: "worker",
      label: "实现",
      description: "照着任务书写代码",
      pi: {
        appendSystemPrompt: "~/.pi/agent/roles/worker.md",
        excludeTools: NO_NETWORK_TOOLS,
      },
      opencode: { agent: "worker" },
    },
    {
      id: "scout",
      label: "侦察",
      description: "只读查清现状，结论带出处",
      pi: {
        appendSystemPrompt: "~/.pi/agent/roles/scout.md",
        excludeTools: ["write", "edit"],
      },
      opencode: { agent: "scout" },
    },
    {
      id: "reviewer",
      label: "评审",
      description: "只看改动挑缺陷，不改文件",
      pi: {
        appendSystemPrompt: "~/.pi/agent/roles/reviewer.md",
        excludeTools: READONLY_NO_NETWORK_TOOLS,
      },
      opencode: { agent: "reviewer" },
    },
    {
      id: "fixer",
      label: "修复",
      description: "只改评审点名的缺陷",
      pi: {
        appendSystemPrompt: "~/.pi/agent/roles/fixer.md",
        excludeTools: NO_NETWORK_TOOLS,
      },
      opencode: {},
    },
    {
      id: "tester",
      label: "测试",
      description: "按任务书描述的行为写测试、跑测试，不改业务代码",
      pi: {
        appendSystemPrompt: `${BUILTIN_PREFIX}roles/tester.md`,
        excludeTools: NO_NETWORK_TOOLS,
      },
      opencode: {},
    },
    {
      id: "ia-scout",
      label: "信息调研",
      description: "调查同类网站的信息结构",
      pi: {
        appendSystemPrompt: "~/.pi/agent/roles/ia-scout.md",
        excludeTools: ["write", "edit"],
      },
      opencode: {},
    },
    {
      id: "ia-expand",
      label: "信息展开",
      description: "把候选项向下展开一层并判断去留",
      pi: {
        appendSystemPrompt: "~/.pi/agent/roles/ia-expand.md",
        excludeTools: READONLY_NO_NETWORK_TOOLS,
      },
      opencode: {},
    },
    {
      id: "ia-critic",
      label: "信息评审",
      description: "挑信息设计文档的毛病",
      pi: {
        appendSystemPrompt: "~/.pi/agent/roles/ia-critic.md",
        excludeTools: READONLY_NO_NETWORK_TOOLS,
      },
      opencode: {},
    },
    {
      id: "ia-writer",
      label: "信息撰写",
      description: "写单个区块的信息设计文件",
      pi: {
        appendSystemPrompt: "~/.pi/agent/roles/ia-writer.md",
        excludeTools: NO_NETWORK_TOOLS,
      },
      opencode: {},
    },
  ],
  runtimes: {
    pi: { command: null },
    opencode: { command: null },
  },
};
