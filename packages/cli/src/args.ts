import { type ParseArgsConfig, parseArgs } from "node:util";
import { CliUsageError } from "./errors.js";

/**
 * 每个子命令都要认的选项：--home 覆盖数据目录，--json 原样吐接口 JSON，--help 打印用法。
 * 具体子命令把自己的选项对象和这个展开合并后再调用 parseCommandArgs。
 */
export const COMMON_OPTIONS = {
  home: { type: "string" },
  json: { type: "boolean" },
  help: { type: "boolean" },
} as const;

/**
 * node:util 的 parseArgs 的小封装：把它抛出的原始错误（未知选项、缺值等）
 * 统一转成 CliUsageError，好在 main.ts 里一处映射成退出码 3；调用方拿到的仍是
 * parseArgs 按传入配置精确推出的类型，不需要自己再做类型断言。
 */
// 不写返回类型标注，让 TS 从 parseArgs(config) 的真实返回值原样推出精确类型；
// node:util 里 ParsedResults<T> 这个类型本身没有导出，写返回类型反而要手写等价结构。
export function parseCommandArgs<T extends ParseArgsConfig>(config: T) {
  try {
    return parseArgs(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : "参数解析失败";
    throw new CliUsageError(`参数不对：${message}`);
  }
}

/** 把命令行传的分钟数字符串转成正数；未传时返回 undefined，交给调用方决定是否用默认值。 */
export function parsePositiveMinutes(
  raw: string | undefined,
  flagName: string,
): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new CliUsageError(`${flagName} 必须是正数（分钟），收到：${raw}`);
  }
  return value;
}

/** 把命令行传的计数字符串转成正整数（例如 --tail）；未传时返回 undefined。 */
export function parsePositiveInteger(
  raw: string | undefined,
  flagName: string,
): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new CliUsageError(`${flagName} 必须是正整数，收到：${raw}`);
  }
  return value;
}

/** 把命令行传的计数字符串转成非负整数（例如 --capacity，0 表示暂停放行）；未传时返回 undefined。 */
export function parseNonNegativeInteger(
  raw: string | undefined,
  flagName: string,
): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new CliUsageError(`${flagName} 必须是不小于 0 的整数，收到：${raw}`);
  }
  return value;
}

/** 校验一个字符串是否落在给定的字面量集合里；用 .some 逐一比较，不用类型断言。 */
export function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return allowed.some((item) => item === value);
}

/** 把命令行传的枚举值校验成指定的字面量类型；未传时返回 undefined。 */
export function parseEnumOption<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  flagName: string,
): T | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!isOneOf(raw, allowed)) {
    throw new CliUsageError(`${flagName} 只能是 ${allowed.join(" / ")} 之一，收到：${raw}`);
  }
  return raw;
}
