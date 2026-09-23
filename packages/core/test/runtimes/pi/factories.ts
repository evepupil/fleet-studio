/**
 * pi 适配器测试专用的小工厂：造 PoolConfig / RoleConfig / BuildLaunchInput，
 * 以及逐行喂事件给 StreamReducer 的小帮手。
 */

import type { PiRoleConfig, PoolConfig, RoleConfig } from "../../../src/config/schema.js";
import { poolConfigSchema, roleConfigSchema } from "../../../src/config/schema.js";
import { FleetError } from "../../../src/domain/errors.js";
import type { TimelineDraft } from "../../../src/domain/timeline.js";
import type { BuildLaunchInput, OutputStream, StreamReducer } from "../../../src/runtimes/types.js";

/** 有 pi 模型的最小池。 */
export function makePiPool(
  overrides: { provider?: string; model?: string; id?: string } = {},
): PoolConfig {
  return poolConfigSchema.parse({
    id: overrides.id ?? "fast",
    label: "快速池",
    capacity: 4,
    runtimes: {
      pi: {
        provider: overrides.provider ?? "mcgrox",
        model: overrides.model ?? "deepseek-v4.1-flash",
      },
    },
  });
}

/** 只配了 opencode 模型的池：用来覆盖「池没有为 pi 指定模型」的分支。 */
export function makeOpencodeOnlyPool(): PoolConfig {
  return poolConfigSchema.parse({
    id: "oc",
    label: "OC 池",
    capacity: 2,
    runtimes: { opencode: { model: "gpt-5-mini" } },
  });
}

/** 最小可用角色，pi 侧配置按需覆盖。 */
export function makeRole(pi: PiRoleConfig = {}): RoleConfig {
  return roleConfigSchema.parse({ id: "worker", label: "实现", pi });
}

export function makeBuildLaunchInput(overrides: Partial<BuildLaunchInput> = {}): BuildLaunchInput {
  return {
    prompt: "把这件事做完",
    runDir: "C:\\fleet\\runs\\w00001.1",
    cwd: "C:\\code\\demo",
    title: "示例任务",
    sessionRef: "fleet-w00001",
    isContinuation: false,
    thinking: null,
    pool: makePiPool(),
    role: makeRole(),
    rolePromptText: null,
    ...overrides,
  };
}

/** 断言 fn 抛出 FleetError 并返回它，方便继续检查 code/message。 */
export function captureFleetError(fn: () => unknown): FleetError {
  try {
    fn();
  } catch (error) {
    if (error instanceof FleetError) {
      return error;
    }
    throw error;
  }
  throw new Error("期望抛出 FleetError，但没有抛出");
}

export const DEFAULT_AT = "2026-09-23T00:00:00.000Z";

/** 依次喂多行给同一个 reducer，返回这些行总共产出的事件（按顺序拼接）。 */
export function feedLines(
  reducer: StreamReducer,
  lines: readonly string[],
  stream: OutputStream = "stdout",
  at: string = DEFAULT_AT,
): TimelineDraft[] {
  const drafts: TimelineDraft[] = [];
  for (const line of lines) {
    drafts.push(...reducer.push(line, stream, at));
  }
  return drafts;
}

/** 最小的助手 message_end 行：只填这个用例关心的字段，其余按真实样本里的形状兜底。 */
export function assistantMessageEndLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [],
      api: "openai-completions",
      provider: "mcgrox",
      model: "deepseek-v4.1-flash",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { total: 0 },
      },
      stopReason: "stop",
      timestamp: 1_700_000_000_000,
      ...overrides,
    },
  });
}
