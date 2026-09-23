import type { ProjectRecord, RunRecord, WorkerRecord } from "@fleet/core";
import { ZERO_USAGE } from "@fleet/core";

/**
 * 存储层测试专用的小工厂：三张表字段都不少，但每条用例真正关心的通常只有一两个字段，
 * 这里给一份能直接写进库的默认值，测试里只覆盖需要的字段。
 */

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
    id: "w00001",
    projectKey: "c:\\code\\demo",
    cwd: "C:\\code\\demo",
    title: "标题",
    role: "worker",
    runtime: "pi",
    poolId: "default",
    model: "mcgrox/deepseek-v4.1-flash",
    thinking: null,
    sessionRef: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    latestRunSeq: 1,
    ...overrides,
  };
}

export function createRunRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "w00001.1",
    workerId: "w00001",
    seq: 1,
    prompt: "任务内容",
    status: "queued",
    failReason: null,
    errorMessage: null,
    queuedAt: "2026-01-01T00:00:00.000Z",
    startedAt: null,
    endedAt: null,
    timeoutMs: 60_000,
    queueTimeoutMs: null,
    pid: null,
    processImage: null,
    spawnedAt: null,
    exitCode: null,
    killedBy: null,
    usage: ZERO_USAGE,
    retry: null,
    activity: null,
    lastActivityAt: null,
    finalText: null,
    eventCount: 0,
    ...overrides,
  };
}
