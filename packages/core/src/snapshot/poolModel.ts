import type { PoolConfig } from "../config/schema.js";
import { FleetError } from "../domain/errors.js";

/**
 * 池在看板上显示的模型名：优先展示 pi 的 `<provider>/<model>`，
 * 池没有配 pi 时才展示 opencode 的 `model`。
 * 配置 schema 的 refine 已经保证一个池至少配了一种运行时的模型，
 * 这里两种都没有时说明配置校验被绕过了，直接报错而不是悄悄显示空字符串。
 */
export function poolDisplayModel(pool: PoolConfig): string {
  const { pi, opencode } = pool.runtimes;
  if (pi) {
    return `${pi.provider}/${pi.model}`;
  }
  if (opencode) {
    return opencode.model;
  }
  throw new FleetError("config_invalid", `池 ${pool.id} 没有为任何运行时配置模型`);
}
