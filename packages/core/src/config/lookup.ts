import type { PoolPatch } from "../api/requests.js";
import { FleetError } from "../domain/errors.js";
import { BUILTIN_PREFIX } from "./defaults.js";
import type {
  FleetConfig,
  OpencodeRoleConfig,
  PiRoleConfig,
  PoolConfig,
  RoleConfig,
} from "./schema.js";

const MS_PER_MINUTE = 60_000;

/** 按编号找池；找不到返回 null。 */
export function findPool(config: FleetConfig, id: string): PoolConfig | null {
  return config.pools.find((pool) => pool.id === id) ?? null;
}

/** 按编号找角色；找不到返回 null。 */
export function findRole(config: FleetConfig, id: string): RoleConfig | null {
  return config.roles.find((role) => role.id === id) ?? null;
}

/** 运行超时优先级：单次覆盖 > 池 > 全局默认，结果转换成毫秒。 */
export function resolveRunTimeoutMs(
  config: FleetConfig,
  pool: PoolConfig,
  overrideMin?: number,
): number {
  const minutes = overrideMin ?? pool.runTimeoutMin ?? config.defaults.runTimeoutMin;
  return minutes * MS_PER_MINUTE;
}

/**
 * 排队超时优先级：单次覆盖 > 池 > 全局默认。
 * overrideMin 显式传 null 表示这次派活排队不限时，不再往下取池 / 全局的值；
 * 只有 overrideMin 是 undefined（没有传）时才走 池 ?? 全局 的兜底链。
 * 最终值为 null 表示不限时，否则转换成毫秒。
 */
export function resolveQueueTimeoutMs(
  config: FleetConfig,
  pool: PoolConfig,
  overrideMin?: number | null,
): number | null {
  const minutes =
    overrideMin === undefined
      ? (pool.queueTimeoutMin ?? config.defaults.queueTimeoutMin)
      : overrideMin;
  return minutes === null ? null : minutes * MS_PER_MINUTE;
}

/** 展开路径需要的环境，由调用方（daemon）提供，核心层自己不读环境变量。 */
export interface PathEnv {
  home: string;
  builtinRoot: string;
}

/** 从字符串开头起，去掉所有等于 char 的字符。 */
function stripLeading(text: string, char: string): string {
  let start = 0;
  while (text.charAt(start) === char) {
    start++;
  }
  return text.slice(start);
}

/** 从字符串末尾起，去掉所有等于 char 的字符。 */
function stripTrailing(text: string, char: string): string {
  let end = text.length;
  while (end > 0 && text.charAt(end - 1) === char) {
    end--;
  }
  return text.slice(0, end);
}

/** 把文本里的 / 和 \ 都换成 separator，其余字符原样保留。 */
function normalizeSeparators(text: string, separator: string): string {
  let result = "";
  for (const ch of text) {
    result += ch === "/" || ch === "\\" ? separator : ch;
  }
  return result;
}

/**
 * 把 remainder 拼到 base 后面：分隔符跟随 base 的风格（含 \ 就用 \，否则用 /），
 * remainder 里的 / 和 \ 统一换成该分隔符，接缝处不产生重复分隔符。
 */
function joinExpanded(base: string, remainder: string): string {
  const separator = base.includes("\\") ? "\\" : "/";
  const normalizedRemainder = stripLeading(normalizeSeparators(remainder, separator), separator);
  const trimmedBase = stripTrailing(base, separator);
  if (normalizedRemainder.length === 0) {
    return trimmedBase.length === 0 ? separator : trimmedBase;
  }
  return `${trimmedBase}${separator}${normalizedRemainder}`;
}

/**
 * 展开 ~（用户目录）和 builtin:（fleet-studio 仓库根目录）开头的路径；其余原样返回。
 * 例：home = "C:\Users\zhoutao"，"~/.pi/agent/roles/worker.md" → "C:\Users\zhoutao\.pi\agent\roles\worker.md"。
 */
export function expandPath(path: string, env: PathEnv): string {
  if (path === "~" || path.startsWith("~/") || path.startsWith("~\\")) {
    return joinExpanded(env.home, path.slice(1));
  }
  if (path.startsWith(BUILTIN_PREFIX)) {
    return joinExpanded(env.builtinRoot, path.slice(BUILTIN_PREFIX.length));
  }
  return path;
}

/** 返回新角色对象，展开 pi.appendSystemPrompt 和 opencode.promptFile，其余字段原样保留。 */
export function expandRolePaths(role: RoleConfig, env: PathEnv): RoleConfig {
  const { appendSystemPrompt, ...restPi } = role.pi;
  const pi: PiRoleConfig = {
    ...restPi,
    ...(appendSystemPrompt !== undefined
      ? { appendSystemPrompt: expandPath(appendSystemPrompt, env) }
      : {}),
  };
  const { promptFile, ...restOpencode } = role.opencode;
  const opencode: OpencodeRoleConfig = {
    ...restOpencode,
    ...(promptFile !== undefined ? { promptFile: expandPath(promptFile, env) } : {}),
  };
  return { ...role, pi, opencode };
}

/**
 * opencode 下角色实际要用的提示词文件路径。
 * 有 opencode.agent 时用内置 agent，不需要提示词文件，返回 null；
 * 否则优先用 opencode 自己的 promptFile，没有就借用 pi 的 appendSystemPrompt。
 */
export function opencodePromptPath(role: RoleConfig): string | null {
  if (role.opencode.agent !== undefined) {
    return null;
  }
  return role.opencode.promptFile ?? role.pi.appendSystemPrompt ?? null;
}

/** 返回新配置，只改指定池的 capacity / perProjectCap；不修改入参；池不存在抛 not_found。 */
export function applyPoolPatch(config: FleetConfig, poolId: string, patch: PoolPatch): FleetConfig {
  if (!config.pools.some((pool) => pool.id === poolId)) {
    throw new FleetError("not_found", `池不存在：${poolId}`);
  }
  const pools = config.pools.map((pool) => {
    if (pool.id !== poolId) {
      return pool;
    }
    return {
      ...pool,
      ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
      ...(patch.perProjectCap !== undefined ? { perProjectCap: patch.perProjectCap } : {}),
    };
  });
  return { ...config, pools };
}
