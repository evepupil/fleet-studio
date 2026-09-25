import type {
  FleetConfig,
  ProjectRecord,
  RunFact,
  RunRecord,
  StatsDimension,
  StatsLabels,
  WorkerFact,
  WorkerRecord,
} from "@fleet/core";

/**
 * 把演示记录翻译成统计模块要的「事实」，并给出显示名和配色。
 * 配色表按 DESIGN.md 第 2 章写死，未知键落到 7。
 */

/** 模型、渠道、角色的配色位置（0～7），与演示配置里的顺序一致 */
const MODEL_COLORS: Readonly<Record<string, number>> = {
  "deepseek-v4.1-flash": 0,
  "GLM-5.3-Flash": 1,
  "qwen3.8-27b": 2,
  "gpt-6-luna": 3,
};

const CHANNEL_COLORS: Readonly<Record<string, number>> = {
  mcgrox: 0,
  chaosyn: 1,
  snow: 2,
  manyrouter: 3,
};

const ROLE_COLORS: Readonly<Record<string, number>> = {
  worker: 0,
  scout: 1,
  reviewer: 2,
  fixer: 3,
  tester: 4,
  collector: 5,
};

/** 未知键的配色位置 */
const UNKNOWN_COLOR = 7;

/** 开跑过的运行才是统计事实（startedAt 不为 null） */
export function runFactsOf(runs: readonly RunRecord[]): RunFact[] {
  const facts: RunFact[] = [];
  for (const run of runs) {
    if (run.startedAt === null) {
      continue;
    }
    facts.push({
      runId: run.id,
      workerId: run.workerId,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      runMs: run.runMs,
      inputTokens: run.usage.inputTokens,
      outputTokens: run.usage.outputTokens,
      cacheReadTokens: run.usage.cacheReadTokens,
      cacheWriteTokens: run.usage.cacheWriteTokens,
      totalTokens: run.usage.totalTokens,
      costUsd: run.usage.costUsd,
    });
  }
  return facts;
}

/** 每个任务的分组字段 */
export function workerFactsOf(workers: readonly WorkerRecord[]): WorkerFact[] {
  return workers.map((worker) => ({
    workerId: worker.id,
    createdAt: worker.createdAt,
    projectKey: worker.projectKey,
    role: worker.role,
    channel: worker.channel,
    modelName: worker.modelName,
  }));
}

function colorOf(table: Readonly<Record<string, number>>, key: string): number {
  return table[key] ?? UNKNOWN_COLOR;
}

/** 统计的显示名和配色：项目查项目表，角色查配置里的角色名，模型 / 渠道按写死的表 */
export function demoStatsLabels(
  projects: readonly ProjectRecord[],
  config: FleetConfig,
): StatsLabels {
  const projectName = new Map<string, string>();
  const projectColor = new Map<string, number>();
  for (const project of projects) {
    projectName.set(project.key, project.name);
    projectColor.set(project.key, project.colorIndex);
  }
  const roleLabel = new Map<string, string>();
  for (const role of config.roles) {
    roleLabel.set(role.id, role.label);
  }
  return {
    projectName,
    projectColor,
    roleLabel,
    seriesColor: (dimension: Exclude<StatsDimension, "project">, key: string): number => {
      switch (dimension) {
        case "model":
          return colorOf(MODEL_COLORS, key);
        case "channel":
          return colorOf(CHANNEL_COLORS, key);
        case "role":
          return colorOf(ROLE_COLORS, key);
      }
    },
  };
}
