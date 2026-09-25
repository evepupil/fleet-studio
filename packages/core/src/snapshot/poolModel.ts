import { type PoolChannelModel, poolChannelModel } from "../config/lookup.js";
import type { PoolConfig } from "../config/schema.js";
import { FleetError } from "../domain/errors.js";

/**
 * 池在看板上显示的渠道、模型名和显示名。
 * 配置 schema 的 refine 已经保证一个池至少配了一种运行时的模型，
 * 这里返回 null 说明配置校验被绕过了，直接报错而不是悄悄显示空字符串。
 */
export function poolModelInfo(pool: PoolConfig): PoolChannelModel {
  const info = poolChannelModel(pool);
  if (info === null) {
    throw new FleetError("config_invalid", `池 ${pool.id} 没有为任何运行时配置模型`);
  }
  return info;
}

/**
 * 池在看板上显示的模型名：优先展示 pi 的 `<provider>/<model>`，
 * 池没有配 pi 时才展示 opencode 的 `model`。
 * 第一版就有的入口，保留给只关心显示名的调用方；等价于 poolModelInfo(pool).display。
 */
export function poolDisplayModel(pool: PoolConfig): string {
  return poolModelInfo(pool).display;
}
