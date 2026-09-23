/**
 * 测试里偷看一行假苦工输出的 JSON 形状时用的小工具。
 * 项目开了 noPropertyAccessFromIndexSignature（Record<string, unknown> 不能用点号读字段），
 * biome 的 useLiteralKeys 又要求字符串字面量下标改回点号——和 packages/core 里各运行时
 * 自己的 summarize.ts 用的是同一个折中：key 走一个字符串参数，两条规则都满足。
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getUnknown(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

export function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = getUnknown(record, key);
  return typeof value === "string" ? value : undefined;
}

/** 一行 JSON 的顶层 "type" 字段；不是对象、解析失败、或没有这个字符串字段都给 undefined。 */
export function lineType(line: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  return isRecord(parsed) ? getString(parsed, "type") : undefined;
}
