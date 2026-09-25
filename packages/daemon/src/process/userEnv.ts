/**
 * 苦工的环境变量：以当前进程环境为底，缺的变量从 Windows 注册表（用户级 + 系统级）里补。
 * 调研报告 pi 第 7 节的教训——像 MCGROX_API_KEY 这类用户刚设置的密钥，常驻的守护进程自己
 * 是看不到的，必须在每次 spawn 子进程前重新读一遍注册表补进去。
 *
 * 安全要求：这个文件产生的任何日志、错误信息都不准出现变量的值，最多写变量名。
 */

import type { Logger } from "../app/types.js";
import { runBackgroundCommand } from "./backgroundCommand.js";

const HKLM_ENVIRONMENT_KEY =
  "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment";
const HKCU_ENVIRONMENT_KEY = "HKCU\\Environment";

/** Path/PATH 不从注册表补：当前进程的 PATH 已经包含它们，重复拼接只会越来越长。 */
const NAMES_NEVER_MERGED_FROM_REGISTRY = new Set(["path"]);

/**
 * 代理相关的变量名（小写比较）。服务进程里的这几个变量来自「拉起服务的那个会话」，
 * 比如 codeg 里的会话带着它自己的本地代理，跟苦工该怎么上网无关，还随拉起者变化。
 * 苦工的代理只由 pi 启动命令读的环境文件决定（见 fleet-ops 的 pi 参考），而那份文件
 * 盖不过已经存在的同名变量，所以补环境前先把继承来的丢掉。
 */
const INHERITED_PROXY_NAMES = new Set(["http_proxy", "https_proxy", "all_proxy", "no_proxy"]);

/** reg query 输出的一行：变量名、注册表类型（REG_SZ / REG_EXPAND_SZ / ...）、原始值。 */
export interface RegistryEntry {
  name: string;
  type: string;
  value: string;
}

// reg query 的数据行固定缩进 4 个空格，字段之间也固定用 4 个空格分隔（本机 Windows 11
// 实测确认，见开发过程记录）。值可能为空，这时“4 空格 + 值”这一段可能整体缺失，两种都接受。
const REGISTRY_LINE_PATTERN = /^ {4}(\S+) {4}(REG_[A-Z_]+)(?: {4}(.*))?$/;

/** 解析 reg query 的原始文本输出，跳过标题行、空行和读不懂的行。 */
export function parseRegQueryOutput(output: string): RegistryEntry[] {
  const entries: RegistryEntry[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = REGISTRY_LINE_PATTERN.exec(line);
    if (match === null) {
      continue;
    }
    const name = match[1];
    const type = match[2];
    if (name === undefined || type === undefined) {
      continue;
    }
    entries.push({ name, type, value: match[3] ?? "" });
  }
  return entries;
}

/** 展开值里的 %NAME% 引用；lookup 里找不到的变量原样保留（cmd.exe 遇到未定义变量也是这样）。 */
export function expandEnvReferences(
  value: string,
  lookup: Readonly<Record<string, string>>,
): string {
  return value.replace(
    /%([^%]+)%/g,
    (match, name: string) => findCaseInsensitive(lookup, name) ?? match,
  );
}

function findCaseInsensitive(
  lookup: Readonly<Record<string, string>>,
  name: string,
): string | undefined {
  const direct = lookup[name];
  if (direct !== undefined) {
    return direct;
  }
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(lookup)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return undefined;
}

/** process.env 的快照，过滤掉未定义的键，给 expandEnvReferences / mergeWorkerEnv 当基底用。 */
export function snapshotProcessEnv(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      snapshot[name] = value;
    }
  }
  return snapshot;
}

/**
 * 去掉服务进程从拉起者那里继承来的代理变量（名字不区分大小写），返回新对象、不改入参。
 * 只用在当前进程环境这一侧；注册表里用户自己设的全局代理是有意的全局设置，照常补进去。
 */
export function dropInheritedProxyVars(
  env: Readonly<Record<string, string>>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (!INHERITED_PROXY_NAMES.has(name.toLowerCase())) {
      result[name] = value;
    }
  }
  return result;
}

/**
 * 读 Windows 用户级 + 系统级注册表环境变量，用户级覆盖系统级；REG_EXPAND_SZ 的值按当前
 * 进程环境展开 %NAME% 引用。非 Windows 直接返回空对象；读失败也返回空对象并记日志（只记
 * 原因，不记任何变量值），不抛异常——这只是锦上添花的补全，读不到不该拖垮服务。
 */
export async function readRegistryEnvironment(logger: Logger): Promise<Record<string, string>> {
  if (process.platform !== "win32") {
    return {};
  }
  const expansionLookup = snapshotProcessEnv();
  const merged: Record<string, string> = {};
  applyEntries(merged, await queryRegistrySafe(HKLM_ENVIRONMENT_KEY, logger), expansionLookup);
  applyEntries(merged, await queryRegistrySafe(HKCU_ENVIRONMENT_KEY, logger), expansionLookup);
  return merged;
}

async function queryRegistrySafe(keyPath: string, logger: Logger): Promise<RegistryEntry[]> {
  try {
    const { stdout } = await runBackgroundCommand("reg", ["query", keyPath]);
    return parseRegQueryOutput(stdout);
  } catch (error) {
    logger.warn(`读取注册表环境变量失败：${keyPath}（${describeError(error)}）`);
    return [];
  }
}

function applyEntries(
  target: Record<string, string>,
  entries: readonly RegistryEntry[],
  expansionLookup: Readonly<Record<string, string>>,
): void {
  for (const entry of entries) {
    target[entry.name] =
      entry.type === "REG_EXPAND_SZ"
        ? expandEnvReferences(entry.value, expansionLookup)
        : entry.value;
  }
}

/**
 * 以当前进程环境为底，注册表里有、当前环境没有的变量补进去。Windows 下变量名比较不区分
 * 大小写；PATH 系变量永远不补（当前进程的 PATH 已经包含它们，重复拼接只会越来越长）。
 */
export function mergeWorkerEnv(
  base: Readonly<Record<string, string>>,
  registry: Readonly<Record<string, string>>,
): Record<string, string> {
  const result: Record<string, string> = { ...base };
  const baseNamesLower = new Set(Object.keys(base).map((name) => name.toLowerCase()));
  for (const [name, value] of Object.entries(registry)) {
    const lowerName = name.toLowerCase();
    if (NAMES_NEVER_MERGED_FROM_REGISTRY.has(lowerName)) {
      continue;
    }
    if (baseNamesLower.has(lowerName)) {
      continue;
    }
    result[name] = value;
  }
  return result;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
