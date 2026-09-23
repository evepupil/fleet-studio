import { type ParseArgsConfig, parseArgs } from "node:util";
import { CliUsageError } from "./errors.js";
import { isRecord, readField } from "./json.js";

/**
 * 每个子命令都要认的选项：--home 覆盖数据目录，--json 原样吐接口 JSON，--help 打印用法。
 * 具体子命令把自己的选项对象和这个展开合并后再调用 parseCommandArgs。
 */
export const COMMON_OPTIONS = {
  home: { type: "string" },
  json: { type: "boolean" },
  help: { type: "boolean" },
} as const;

const HELP_HINT = "用 fleet <子命令> --help 查看用法";

/** 从 parseArgs 抛出的英文错误对象上读 code：Node 没有导出这个类型，只能当成普通对象探测。 */
function readNodeErrorCode(error: unknown): string | null {
  if (!isRecord(error)) {
    return null;
  }
  const code = readField(error, "code");
  return typeof code === "string" ? code : null;
}

/** 错误信息里选项名一律写成 '--xxx' 或 '-x' 这种带引号的形式，取引号里第一个词就是选项名。 */
function extractOptionToken(message: string): string | null {
  const match = /'(--?[^'\s]+)/.exec(message);
  return match?.[1] ?? null;
}

/**
 * 把 parseArgs 抛出的英文错误翻译成中文（规格 3.1：全部输出中文）。
 * Node 只在错误对象上挂了 code 和一句拼好的英文 message，没有结构化的字段，
 * 选项名只能从 message 里挖：错误信息里选项名统一用单引号包着，形如 '--xxx' 或 '-x'。
 */
function translateParseArgsError(error: unknown): string {
  if (!(error instanceof Error)) {
    return `参数不对。${HELP_HINT}`;
  }
  const code = readNodeErrorCode(error);
  const option = extractOptionToken(error.message);
  if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
    return `不认识的选项：${option ?? error.message}。${HELP_HINT}`;
  }
  if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
    return `选项 ${option ?? error.message} 的取值不对。${HELP_HINT}`;
  }
  return `参数不对。${HELP_HINT}`;
}

/**
 * node:util 的 parseArgs 的小封装：把它抛出的原始错误（未知选项、缺值等）
 * 统一转成中文的 CliUsageError，好在 main.ts 里一处映射成退出码 3；调用方拿到的仍是
 * parseArgs 按传入配置精确推出的类型，不需要自己再做类型断言。
 */
// 不写返回类型标注，让 TS 从 parseArgs(config) 的真实返回值原样推出精确类型；
// node:util 里 ParsedResults<T> 这个类型本身没有导出，写返回类型反而要手写等价结构。
export function parseCommandArgs<T extends ParseArgsConfig>(config: T) {
  try {
    return parseArgs(config);
  } catch (error) {
    throw new CliUsageError(translateParseArgsError(error));
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
