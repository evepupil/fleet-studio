/**
 * 快照汇总测试的公共工厂函数。
 * 配置对象统一用 fleetConfigSchema.parse 造，不依赖别的模块正在写的默认配置。
 */

import type { FleetConfig, FleetConfigInput } from "../../src/config/schema.js";
import { fleetConfigSchema } from "../../src/config/schema.js";
import type { ProjectRecord, RunRecord, WorkerRecord } from "../../src/domain/records.js";
import type { Usage } from "../../src/domain/usage.js";
import { ZERO_USAGE } from "../../src/domain/usage.js";

const DEFAULT_TIME = "2026-09-23T00:00:00.000Z";

/**
 * 最小可用配置：一个 pi 池（fast）、一个 opencode 池（oc，带单项目上限），两个角色。
 * 覆盖 poolDisplayModel 的两条分支，以及"角色配置里找不到时退回角色编号"的兜底场景。
 */
export function baseConfig(overrides: Partial<FleetConfigInput> = {}): FleetConfig {
  return fleetConfigSchema.parse({
    version: 1,
    defaults: { pool: "fast" },
    pools: [
      {
        id: "fast",
        label: "快速池",
        capacity: 4,
        runtimes: { pi: { provider: "mcgrox", model: "deepseek-v4.1-flash" } },
      },
      {
        id: "oc",
        label: "OC 池",
        capacity: 2,
        perProjectCap: 1,
        runtimes: { opencode: { model: "gpt-5-mini" } },
      },
    ],
    roles: [
      { id: "worker", label: "实现" },
      { id: "reviewer", label: "评审" },
    ],
    ...overrides,
  });
}

export function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    key: "c:/code/demo",
    path: "C:/code/demo",
    name: "demo",
    colorIndex: 0,
    createdAt: DEFAULT_TIME,
    ...overrides,
  };
}

export function makeWorker(overrides: Partial<WorkerRecord> = {}): WorkerRecord {
  return {
    id: "w00001",
    projectKey: "c:/code/demo",
    cwd: "C:/code/demo",
    title: "示例任务",
    role: "worker",
    runtime: "pi",
    poolId: "fast",
    model: "mcgrox/deepseek-v4.1-flash",
    thinking: null,
    sessionRef: "fleet-w00001",
    createdAt: DEFAULT_TIME,
    latestRunSeq: 1,
    ...overrides,
  };
}

export function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "w00001.1",
    workerId: "w00001",
    seq: 1,
    prompt: "把这件事做完",
    status: "running",
    failReason: null,
    errorMessage: null,
    queuedAt: "2026-09-23T00:00:00.000Z",
    startedAt: "2026-09-23T00:01:00.000Z",
    endedAt: null,
    timeoutMs: 1_800_000,
    queueTimeoutMs: null,
    pid: 1234,
    processImage: "node.exe",
    exitCode: null,
    killedBy: null,
    usage: { ...ZERO_USAGE },
    retry: null,
    activity: null,
    lastActivityAt: null,
    finalText: null,
    eventCount: 0,
    ...overrides,
  };
}

export function makeUsage(overrides: Partial<Usage> = {}): Usage {
  return { ...ZERO_USAGE, ...overrides };
}
