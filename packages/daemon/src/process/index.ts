/** 进程托管层汇总导出：契约类型（types.ts）+ 各项实现。 */

export type { IdentityProbe, IdentityQuery, ProcessFacts } from "./identityProbe.js";
export {
  createIdentityProbe,
  IDENTITY_CLOCK_TOLERANCE_MS,
  matchesIdentity,
  parseProcessFactsLines,
} from "./identityProbe.js";
export { killTree } from "./killTree.js";
export { createOutputTailer } from "./outputTailer.js";
export type { ProcessHostOptions } from "./processHost.js";
export { createProcessHost, IDENTITY_RECHECK_MS } from "./processHost.js";
export type { TasklistEntry } from "./processProbe.js";
export { isProcessAlive, parseTasklistCsv } from "./processProbe.js";
export type { RuntimeResolver, RuntimeResolverOptions } from "./runtimeResolver.js";
export { createRuntimeResolver } from "./runtimeResolver.js";
export { spawnWorker } from "./spawnWorker.js";
export type {
  OutputTailer,
  ProcessExitInfo,
  ProcessHost,
  ProcessIdentity,
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
