/**
 * 组装进程托管层：把可执行文件探测、环境变量补齐、分离启动、结束进程树、存活判断
 * 拼成 ProcessHost 接口（模块设计第 3.7 节）。
 */

import type { FleetConfig, RuntimeId } from "@fleet/core";
import type { Logger } from "../app/types.js";
import { killTree } from "./killTree.js";
import { isProcessAlive } from "./processProbe.js";
import { createRuntimeResolver } from "./runtimeResolver.js";
import { spawnWorker } from "./spawnWorker.js";
import type { ProcessHost, ResolvedCommand, SpawnedProcess, SpawnRequest } from "./types.js";
import { mergeWorkerEnv, readRegistryEnvironment, snapshotProcessEnv } from "./userEnv.js";

/** workerEnv() 的缓存时长：用户新设了密钥不用重启服务，最多等 60 秒就能生效。 */
const WORKER_ENV_TTL_MS = 60_000;

export interface ProcessHostOptions {
  getConfig: () => FleetConfig;
  logger: Logger;
}

interface WorkerEnvCache {
  value: Record<string, string>;
  expiresAt: number;
}

export function createProcessHost(options: ProcessHostOptions): ProcessHost {
  const { getConfig, logger } = options;
  const resolver = createRuntimeResolver({ getConfig });
  let workerEnvCache: WorkerEnvCache | null = null;

  async function computeWorkerEnv(): Promise<Record<string, string>> {
    const registryEnv = await readRegistryEnvironment(logger);
    return mergeWorkerEnv(snapshotProcessEnv(), registryEnv);
  }

  return {
    resolve(runtime: RuntimeId): Promise<ResolvedCommand> {
      return resolver.resolve(runtime);
    },

    spawn(request: SpawnRequest): Promise<SpawnedProcess> {
      return spawnWorker(request);
    },

    kill(pid: number): Promise<void> {
      return killTree(pid);
    },

    isAlive(pid: number, image: string | null): Promise<boolean> {
      return isProcessAlive(pid, image);
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
