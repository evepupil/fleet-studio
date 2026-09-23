/**
 * 找运行时可执行文件：配置里写死的 command 优先用；没写死时自动探测 npm 全局安装目录里的
 * pi / opencode 包，从 package.json 的 bin 字段拼出真正要 spawn 的入口。
 *
 * 绝不允许落到 pi.cmd / opencode.cmd 这类外壳文件——调研实测它们会在第一个换行处截断
 * 多行任务（docs/调研/pi-运行时.md 第 1、2 节；docs/调研/opencode-运行时.md 第 1 节）。
 */

import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { FleetConfig, RuntimeId } from "@fleet/core";
import { FleetError } from "@fleet/core";
import type { ResolvedCommand } from "./types.js";

const execFileAsync = promisify(execFile);

export interface RuntimeResolverOptions {
  getConfig: () => FleetConfig;
  /** 测试注入：跳过真实探测，直接把这个目录当作 npm 全局安装目录使用。 */
  npmGlobalRoot?: string;
}

export interface RuntimeResolver {
  /** 找到运行时的可执行文件；找不到抛 FleetError("runtime_unavailable")。 */
  resolve(runtime: RuntimeId): Promise<ResolvedCommand>;
  /** 丢掉探测缓存（npm 全局目录 + 已解析的运行时），下次 resolve 重新探测。 */
  invalidate(): void;
}

/**
 * 创建一个运行时解析器。自动探测的结果缓存到 invalidate() 为止；配置覆盖不缓存
 * （每次 resolve 都读最新配置，配置一改立刻生效，不需要额外 invalidate）。
 */
export function createRuntimeResolver(options: RuntimeResolverOptions): RuntimeResolver {
  let npmGlobalRootPromise: Promise<string> | null = null;
  const resolvedCache = new Map<RuntimeId, Promise<ResolvedCommand>>();

  function npmGlobalRoot(): Promise<string> {
    if (npmGlobalRootPromise === null) {
      npmGlobalRootPromise = resolveNpmGlobalRoot(options.npmGlobalRoot).catch((error: unknown) => {
        npmGlobalRootPromise = null; // 失败不缓存，下次重新探测
        throw error;
      });
    }
    return npmGlobalRootPromise;
  }

  async function probe(runtime: RuntimeId): Promise<ResolvedCommand> {
    const root = await npmGlobalRoot();
    return probeRuntime(runtime, root);
  }

  return {
    resolve(runtime: RuntimeId): Promise<ResolvedCommand> {
      const fromConfig = resolveFromConfig(runtime, options.getConfig());
      if (fromConfig !== null) {
        return Promise.resolve(fromConfig);
      }

      const cached = resolvedCache.get(runtime);
      if (cached !== undefined) {
        return cached;
      }

      const promise = probe(runtime).catch((error: unknown) => {
        resolvedCache.delete(runtime); // 探测失败不缓存，下次重试
        throw error;
      });
      resolvedCache.set(runtime, promise);
      return promise;
    },
    invalidate(): void {
      npmGlobalRootPromise = null;
      resolvedCache.clear();
    },
  };
}

/** 配置里写死的可执行文件优先于自动探测；command 为 null（没配）时返回 null。 */
function resolveFromConfig(runtime: RuntimeId, config: FleetConfig): ResolvedCommand | null {
  const command = config.runtimes[runtime].command;
  if (command === null) {
    return null;
  }
  const executable = command[0];
  if (executable === undefined) {
    throw new FleetError("runtime_unavailable", `运行时 ${runtime} 的 command 配置为空`);
  }
  return { executable, prefixArgs: command.slice(1), image: basename(executable).toLowerCase() };
}

async function resolveNpmGlobalRoot(injected: string | undefined): Promise<string> {
  if (injected !== undefined) {
    return injected;
  }
  if (process.platform === "win32") {
    const appData = readEnvVar("APPDATA");
    if (appData !== undefined) {
      const candidate = join(appData, "npm", "node_modules");
      if (await pathExists(candidate)) {
        return candidate;
      }
    }
    // npm 在 Windows 上是 .cmd 外壳；这是唯一允许经过 cmd.exe 的命令，字符串不含任何外部输入。
    const { stdout } = await execFileAsync("cmd.exe", ["/d", "/s", "/c", "npm root -g"]);
    return stdout.trim();
  }
  const { stdout } = await execFileAsync("npm", ["root", "-g"]);
  return stdout.trim();
}

// 项目开了 noPropertyAccessFromIndexSignature，process.env 不能用点号读字段。
function readEnvVar(name: string): string | undefined {
  return process.env[name];
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function probeRuntime(runtime: RuntimeId, npmRoot: string): Promise<ResolvedCommand> {
  switch (runtime) {
    case "pi":
      return probePi(npmRoot);
    case "opencode":
      return probeOpencode(npmRoot);
    default: {
      const exhaustiveCheck: never = runtime;
      return Promise.reject(
        new FleetError("runtime_unavailable", `未知运行时：${String(exhaustiveCheck)}`),
      );
    }
  }
}

/** pi 没有原生可执行文件，入口是一段 JS：spawn 的是 process.execPath + 这段脚本。 */
async function probePi(npmRoot: string): Promise<ResolvedCommand> {
  const packageDir = join(npmRoot, "@earendil-works", "pi-coding-agent");
  const entryPath = await resolveBinEntry("pi", packageDir, "pi");
  return {
    executable: process.execPath,
    prefixArgs: [entryPath],
    image: process.platform === "win32" ? "node.exe" : "node",
  };
}

/** opencode 的 bin 字段指向一个平台原生可执行文件，直接 spawn 它自己。 */
async function probeOpencode(npmRoot: string): Promise<ResolvedCommand> {
  const packageDir = join(npmRoot, "opencode-ai");
  const entryPath = await resolveBinEntry("opencode", packageDir, "opencode");
  return { executable: entryPath, prefixArgs: [], image: basename(entryPath).toLowerCase() };
}

/** 读 <packageDir>/package.json 的 bin 字段，拼出入口文件的绝对路径；找不到就报中文错误。 */
async function resolveBinEntry(
  runtime: RuntimeId,
  packageDir: string,
  binName: string,
): Promise<string> {
  const packageJsonPath = join(packageDir, "package.json");
  const relativeEntry = extractBinPath(await readJsonFile(packageJsonPath), binName);
  const triedPath = relativeEntry === null ? packageJsonPath : join(packageDir, relativeEntry);
  if (relativeEntry === null || !(await pathExists(triedPath))) {
    throw new FleetError("runtime_unavailable", `找不到 ${runtime}：${triedPath}`);
  }
  return triedPath;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 项目开了 noPropertyAccessFromIndexSignature，Record<string, unknown> 不能用点号读字段。 */
function readUnknownField(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

/** package.json 的 bin 字段可能是字符串（唯一命令）或对象（命令名 -> 脚本路径），两种写法都要认。 */
function extractBinPath(pkg: unknown, binName: string): string | null {
  if (!isRecord(pkg)) {
    return null;
  }
  const bin = readUnknownField(pkg, "bin");
  if (typeof bin === "string") {
    return bin;
  }
  if (isRecord(bin)) {
    const entry = readUnknownField(bin, binName);
    return typeof entry === "string" ? entry : null;
  }
  return null;
}
