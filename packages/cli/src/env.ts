/**
 * 按变量名（不是字面量）读一个环境变量。
 *
 * 为什么不直接写 env["KEY"] 或 env.KEY：NodeJS.ProcessEnv 只有下标签名，属于「只能靠下标
 * 访问」的类型——tsconfig 开着的 noPropertyAccessFromIndexSignature 要求这种类型必须用
 * env["KEY"] 这种下标写法，写成 env.KEY 会编译失败；但 biome 的 useLiteralKeys 规则又反过来
 * 建议把字面量下标改成点号访问。两条规则在「下标是字符串字面量」时互相矛盾，唯一都满足的写法
 * 是下标用变量：把字面量放进这个函数的参数，函数体内 env[key] 的下标是参数 key（变量），
 * 两条规则都不会对「变量下标」有意见。
 */
export function readEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  return env[key];
}
