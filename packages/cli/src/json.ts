/**
 * 校验网络响应、daemon.json 这类不可信 JSON 的最小工具。
 *
 * readField 用变量做下标而不是字面量，原因同 env.ts 顶部注释：Record<string, unknown> 也是
 * 只能靠下标访问的类型，点号访问会被 noPropertyAccessFromIndexSignature 拦下来，
 * 但字面量下标又会被 biome 的 useLiteralKeys 建议改回点号；下标用变量两边都满意。
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readField(value: Record<string, unknown>, key: string): unknown {
  return value[key];
}
