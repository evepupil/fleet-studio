/**
 * 在配置文件的**原始 JSON 对象**上改池的启用状态和顺序（模块设计 8.2 节）。
 * 不走解析后的 FleetConfig，是因为写回配置时要原样保留用户手写的其余字段、字段顺序和
 * 没写的默认值——一旦经过 zod 补齐再序列化，这些都会被抹掉。
 * 两个函数都不修改入参，返回新对象。
 */
import { FleetError } from "../domain/errors.js";

/** 结构不对时的统一说明：调用方拿到的原文可能根本没经过校验。 */
const BAD_STRUCTURE = "配置文件结构不对：缺少 pools 数组";

/**
 * 原始 JSON 对象的最小形状：只要有 pools 数组就行，其余字段一概不管（原样带过）。
 * 显式写出 pools 而不是用索引签名，是为了让「读 pools」这一步在类型上也过一遍检查。
 */
interface RawConfigLike {
  pools: unknown[];
  [key: string]: unknown;
}

/** 单个池在原始 JSON 里的最小形状；id 可能缺失或类型不对，由调用方处理。 */
interface RawPoolLike {
  id?: unknown;
  [key: string]: unknown;
}

/** 检查原始对象里确实有一个 pools 数组，返回它；否则抛 config_invalid。 */
function readRawPools(raw: unknown): unknown[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new FleetError("config_invalid", BAD_STRUCTURE);
  }
  const pools = (raw as { pools?: unknown }).pools;
  if (!Array.isArray(pools)) {
    throw new FleetError("config_invalid", BAD_STRUCTURE);
  }
  return pools;
}

/**
 * 池在原始 JSON 里的编号；只有字符串才当作编号。
 * 编号不合法（缺失、类型不对）的条目统一按空串处理，这样它们既不会被误命中，
 * 也不会让重排的排列检查因为「多出几个未知编号」而误报。
 */
function rawPoolId(pool: unknown): string {
  if (typeof pool !== "object" || pool === null || Array.isArray(pool)) {
    return "";
  }
  const id = (pool as RawPoolLike).id;
  return typeof id === "string" ? id : "";
}

/**
 * 改池的启用状态：enabled 为 true 时删掉这个字段（默认就是启用，写回去的文件更干净），
 * 为 false 时写 false。池不存在抛 not_found；结构不对抛 config_invalid。
 */
export function setPoolEnabledRaw(raw: unknown, poolId: string, enabled: boolean): unknown {
  const pools = readRawPools(raw);
  const index = pools.findIndex((pool) => rawPoolId(pool) === poolId);
  if (index === -1) {
    throw new FleetError("not_found", `池不存在：${poolId}`);
  }
  const target = pools[index];
  const nextPools = [...pools];
  if (typeof target === "object" && target !== null && !Array.isArray(target)) {
    const { enabled: _drop, ...rest } = target as RawPoolLike;
    nextPools[index] = enabled ? rest : { ...rest, enabled: false };
  } else {
    // 结构已经坏成这样，parseConfig 之后也过不了校验；原样保留，让调用方拿到明确的问题。
    nextPools[index] = target;
  }
  return { ...(raw as RawConfigLike), pools: nextPools };
}

/**
 * 按 poolIds 重排 pools：poolIds 必须恰好是当前全部池编号的一个排列，否则说明看板拿到的
 * 列表已经过期，抛 conflict 让用户刷新。每个池对象本身原样搬过去，不动其中任何字段。
 */
export function reorderPoolsRaw(raw: unknown, poolIds: readonly string[]): unknown {
  const pools = readRawPools(raw);
  const currentIds = pools.map(rawPoolId);
  const isPermutation =
    poolIds.length === currentIds.length &&
    new Set(poolIds).size === poolIds.length &&
    currentIds.every((id) => poolIds.includes(id));
  if (!isPermutation) {
    throw new FleetError("conflict", "池的列表已经变了，请刷新后再调顺序");
  }
  const byId = new Map<string, unknown>();
  for (let i = 0; i < pools.length; i++) {
    const id = currentIds[i];
    if (id !== undefined) {
      byId.set(id, pools[i]);
    }
  }
  const nextPools = poolIds.map((id) => byId.get(id));
  return { ...(raw as RawConfigLike), pools: nextPools };
}
