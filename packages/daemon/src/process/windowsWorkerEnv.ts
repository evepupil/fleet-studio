/** 为 Windows 上由 Node 启动的苦工预载子进程窗口策略，其他运行时沿用原环境。 */
export function windowsWorkerEnv(
  env: Record<string, string>,
  image: string,
): Record<string, string> {
  if (process.platform !== "win32" || image.toLowerCase() !== "node.exe") return env;

  // Node 24 支持直接加载源码中的可擦除类型，测试与构建产物使用同一份策略。
  const sourceName = import.meta.url.endsWith(".ts")
    ? "./windowsChildPolicy.ts"
    : "./windowsChildPolicy.js";
  const preload = `--import=${new URL(sourceName, import.meta.url).href}`;
  const key =
    Object.keys(env).find((name) => name.toLowerCase() === "node_options") ?? "NODE_OPTIONS";
  const existing = env[key] ?? "";
  if (existing.split(/\s+/).includes(preload)) return env;
  return { ...env, [key]: `${existing} ${preload}`.trim() };
}
