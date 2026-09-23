/** 进程托管层汇总导出：契约类型（types.ts）+ 各项实现。 */

export { killTree } from "./killTree.js";
export { createOutputTailer } from "./outputTailer.js";
export type { ProcessHostOptions } from "./processHost.js";
export { createProcessHost } from "./processHost.js";
export type { TasklistEntry } from "./processProbe.js";
export { isProcessAlive, parseTasklistCsv } from "./processProbe.js";
export type { RuntimeResolver, RuntimeResolverOptions } from "./runtimeResolver.js";
export { createRuntimeResolver } from "./runtimeResolver.js";
export { spawnWorker } from "./spawnWorker.js";
export type {
  OutputTailer,
  ProcessExitInfo,
  ProcessHost,
  ResolvedCommand,
  SpawnedProcess,
  SpawnRequest,
} from "./types.js";
export type { RegistryEntry } from "./userEnv.js";
export {
  expandEnvReferences,
  mergeWorkerEnv,
  parseRegQueryOutput,
  readRegistryEnvironment,
  snapshotProcessEnv,
} from "./userEnv.js";
