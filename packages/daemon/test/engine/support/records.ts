/** 引擎测试专用的记录工厂：三张表字段都不少，测试只覆盖关心的字段。 */
import type { ProjectRecord, RunRecord, WorkerRecord } from "@fleet/core";
import { ZERO_USAGE } from "@fleet/core";

export function createProjectRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    key: "c:\\code\\demo",
    path: "C:\\code\\demo",
    name: "demo",
    colorIndex: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function createWorkerRecord(overrides: Partial<WorkerRecord> = {}): WorkerRecord {
  return {
    id: "wabcde",
    projectKey: "c:\\code\\demo",
    cwd: "C:\\code\\demo",
    title: "标题",
    role: "worker",
    runtime: "pi",
    requestedPool: "dsf",
    poolId: "dsf",
    model: "mcgrox/deepseek-v4.1-flash",
    channel: "mcgrox",
    modelName: "deepseek-v4.1-flash",
    thinking: null,
    sessionRef: "fleet-wabcde",
    createdAt: "2026-01-01T00:00:00.000Z",
    latestRunSeq: 1,
    ...overrides,
  };
}

export function createRunRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "wabcde.1",
    workerId: "wabcde",
    seq: 1,
    prompt: "任务内容",
    status: "queued",
    failReason: null,
    errorMessage: null,
    queuedAt: "2026-01-01T00:00:00.000Z",
    startedAt: null,
    endedAt: null,
    timeoutMs: 30 * 60_000,
    queueTimeoutMs: null,
    pid: null,
    processImage: null,
    spawnedAt: null,
    exitCode: null,
    killedBy: null,
    usage: ZERO_USAGE,
    runMs: null,
    retry: null,
    activity: null,
    lastActivityAt: null,
    finalText: null,
    eventCount: 0,
    ...overrides,
  };
}
