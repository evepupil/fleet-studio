/**
 * 组装进程托管层：把可执行文件探测、环境变量补齐、分离启动、结束进程树、存活判断
 * 拼成 ProcessHost 接口（模块设计第 3.7 节）。
 */

import type { FleetConfig, RuntimeId } from "@fleet/core";
import type { Logger } from "../app/types.js";
import { createIdentityProbe, type IdentityQuery, matchesIdentity } from "./identityProbe.js";
import { killTree } from "./killTree.js";
import { isProcessAlive } from "./processProbe.js";
import { createRuntimeResolver } from "./runtimeResolver.js";
import { spawnWorker } from "./spawnWorker.js";
import type {
  ProcessHost,
  ProcessIdentity,
  ResolvedCommand,
  SpawnedProcess,
  SpawnRequest,
} from "./types.js";
import {
  dropInheritedProxyVars,
  mergeWorkerEnv,
  readRegistryEnvironment,
  snapshotProcessEnv,
} from "./userEnv.js";

/** workerEnv() 的缓存时长：用户新设了密钥不用重启服务，最多等 60 秒就能生效。 */
const WORKER_ENV_TTL_MS = 60_000;

/**
 * 接管的进程号完整核对身份（起 PowerShell 查 WMI）之后，这个「通过」的结果最多信多久
 * （模块设计：服务层-进程托管 3.5 性能约束第 2 条）。2026-09-24 实测一次完整核对约 1.7 秒，
 * `tasklist` 约 0.09 秒；接管期间每 2 秒探活一次，不能每次都重新起一次 PowerShell。
 */
export const IDENTITY_RECHECK_MS = 30_000;

export interface ProcessHostOptions {
  getConfig: () => FleetConfig;
  logger: Logger;
  /** 测试注入：身份查询函数，默认真的起 PowerShell 查 WMI（见 identityProbe.ts 的 defaultQuery）。 */
  identityQuery?: IdentityQuery;
  /** 测试注入：完整核对结果 30 秒缓存用的时钟，默认 Date.now。 */
  now?: () => number;
}

interface WorkerEnvCache {
  value: Record<string, string>;
  expiresAt: number;
}

/** 完整核对通过之后缓存的结果；连着当时核对的 spawnedAtMs 一起存，身份变了缓存自动失效。 */
interface IdentityCacheEntry {
  spawnedAtMs: number;
  checkedAtMs: number;
}

export function createProcessHost(options: ProcessHostOptions): ProcessHost {
  const { getConfig, logger } = options;
  const resolver = createRuntimeResolver({ getConfig });
  const identityProbe = createIdentityProbe(options.identityQuery);
  const clock = options.now ?? Date.now;
  let workerEnvCache: WorkerEnvCache | null = null;

  // 自己 spawn 出来、还没收到退出事件的进程号：句柄一直在手里，这个号不可能被系统复用
  // 给别的进程，kill/isAlive 都不用核对身份（模块设计 3.5 性能约束第 1 条）。
  const selfSpawnedPids = new Set<number>();
  // 接管的进程号做完整核对通过之后的缓存，键是进程号（模块设计 3.5 性能约束第 2 条）。
  const identityCache = new Map<number, IdentityCacheEntry>();

  async function computeWorkerEnv(): Promise<Record<string, string>> {
    const registryEnv = await readRegistryEnvironment(logger);
    return mergeWorkerEnv(dropInheritedProxyVars(snapshotProcessEnv()), registryEnv);
  }

  /** 起一次 PowerShell 查 WMI 做完整核对；不看也不写缓存，调用方各自决定要不要用缓存。 */
  async function checkIdentityFull(pid: number, identity: ProcessIdentity): Promise<boolean> {
    try {
      const facts = await identityProbe.lookup(pid);
      return facts !== null && matchesIdentity(facts, identity);
    } catch {
      // 探针本身出错（PowerShell 起不来、WMI 故障）：记一条警告，退回只核对映像名。
      logger.warn(`核对进程身份失败，退回只核对映像名：pid=${pid}`);
      return isProcessAlive(pid, identity.image);
    }
  }

  /**
   * isAlive 用的存活判断（模块设计 3.5 性能约束第 1、2 条）：自己启动的号或者调用方明确传
   * identity=null 时只看进程还在不在；旧记录（没有 spawnedAtMs）或非 Windows 退回只核对映像名；
   * 否则先做便宜的 `tasklist` 快速核对，不通过直接判不活（退出能在 2 秒内发现）；通过时同一个
   * 「进程号 + spawnedAtMs」的完整核对最多 30 秒做一次，命中缓存就直接信上次的结果。
   */
  async function checkAliveForQuery(
    pid: number,
    identity: ProcessIdentity | null,
  ): Promise<boolean> {
    if (identity === null || selfSpawnedPids.has(pid)) {
      return isProcessAlive(pid, null);
    }
    if (identity.spawnedAtMs === null || process.platform !== "win32") {
      return isProcessAlive(pid, identity.image);
    }
    const fastAlive = await isProcessAlive(pid, identity.image);
    if (!fastAlive) {
      identityCache.delete(pid);
      return false;
    }
    const cached = identityCache.get(pid);
    const nowMs = clock();
    if (
      cached !== undefined &&
      cached.spawnedAtMs === identity.spawnedAtMs &&
      nowMs - cached.checkedAtMs < IDENTITY_RECHECK_MS
    ) {
      return true; // 30 秒内已经完整核对过这个「进程号 + spawnedAtMs」，不用再起一次 PowerShell
    }
    const matched = await checkIdentityFull(pid, identity);
    if (matched) {
      identityCache.set(pid, { spawnedAtMs: identity.spawnedAtMs, checkedAtMs: nowMs });
    } else {
      identityCache.delete(pid);
    }
    return matched;
  }

  /**
   * kill 用的身份核对（模块设计 3.5 性能约束第 1、3 条）：自己启动的号或者调用方明确传
   * identity=null 时不核对，直接允许；旧记录或非 Windows 退回只核对映像名；否则每次都做
   * 完整核对，不看 isAlive 用的 30 秒缓存——结束进程不可逆，宁可慢 2 秒也不能认错人。
   */
  async function shouldProceedWithKill(
    pid: number,
    identity: ProcessIdentity | null,
  ): Promise<boolean> {
    if (identity === null || selfSpawnedPids.has(pid)) {
      return true;
    }
    if (identity.spawnedAtMs === null || process.platform !== "win32") {
      return isProcessAlive(pid, identity.image);
    }
    return checkIdentityFull(pid, identity);
  }

  return {
    resolve(runtime: RuntimeId): Promise<ResolvedCommand> {
      return resolver.resolve(runtime);
    },

    async spawn(request: SpawnRequest): Promise<SpawnedProcess> {
      const spawned = await spawnWorker(request);
      // spawn 成功时加入快路径名单，退出事件触发时移除（模块设计 3.5 性能约束第 1 条）。
      selfSpawnedPids.add(spawned.pid);
      spawned.onExit(() => {
        selfSpawnedPids.delete(spawned.pid);
        identityCache.delete(spawned.pid);
      });
      return spawned;
    },

    async kill(pid: number, identity: ProcessIdentity | null): Promise<void> {
      if (!(await shouldProceedWithKill(pid, identity))) {
        // 这个号已经不是当初启动的那个进程了（或者已经不在了），绝不能对它动手。
        return;
      }
      await killTree(pid);
    },

    isAlive(pid: number, identity: ProcessIdentity | null): Promise<boolean> {
      return checkAliveForQuery(pid, identity);
    },

    async workerEnv(): Promise<Record<string, string>> {
      const now = Date.now();
      if (workerEnvCache !== null && workerEnvCache.expiresAt > now) {
        return workerEnvCache.value;
      }
      const value = await computeWorkerEnv();
      workerEnvCache = { value, expiresAt: now + WORKER_ENV_TTL_MS };
      return value;
    },

    invalidate(): void {
      resolver.invalidate();
      workerEnvCache = null;
    },
  };
}
