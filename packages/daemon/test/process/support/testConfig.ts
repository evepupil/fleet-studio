/** 测试用的最小可用 FleetConfig：从项目默认配置校验出一份，再按需改 runtimes 覆盖。 */

import type { FleetConfig, RuntimeId } from "@fleet/core";
import { DEFAULT_CONFIG, parseConfig } from "@fleet/core";

export function baseFleetConfig(): FleetConfig {
  const result = parseConfig(DEFAULT_CONFIG);
  if (!result.ok) {
    throw new Error("DEFAULT_CONFIG 应该总是能通过校验，测试基础设施本身出了问题");
  }
  return result.config;
}

/** 返回一份新配置，把指定运行时的 command 换成给定值，其余字段不变。 */
export function withRuntimeCommand(
  config: FleetConfig,
  runtime: RuntimeId,
  command: string[] | null,
): FleetConfig {
  return {
    ...config,
    runtimes: { ...config.runtimes, [runtime]: { command } },
  };
}
