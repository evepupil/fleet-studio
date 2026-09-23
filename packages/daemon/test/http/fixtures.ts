import {
  type HealthInfo,
  type PoolView,
  type RoleView,
  type Snapshot,
  type TimelineEvent,
  type WorkerDetail,
  type WorkerSummary,
  ZERO_USAGE,
} from "@fleet/core";

/**
 * 接口层测试用的最小可行 DTO 构造器：每个字段先给个跑得通的默认值，
 * 单个测试只覆盖自己关心的字段，其余细节不需要重复搭。
 */

export function createHealth(overrides: Partial<HealthInfo> = {}): HealthInfo {
  return {
    ok: true,
    version: "0.1.0-test",
    startedAt: "2026-09-23T00:00:00.000Z",
    pid: 12345,
    home: "C:\\fake\\.fleet-studio",
    port: 0,
    ...overrides,
  };
}

export function createWorkerSummary(overrides: Partial<WorkerSummary> = {}): WorkerSummary {
  return {
    id: "wabc23",
    projectKey: "c:\\code\\demo",
    cwd: "C:\\code\\demo",
    title: "测试苦工",
    role: "test",
    roleLabel: "测试",
    runtime: "pi",
    poolId: "default",
    model: "mcgrox/deepseek-v4.1-flash",
    status: "queued",
    failReason: null,
    errorMessage: null,
    runSeq: 1,
    createdAt: "2026-09-23T00:00:00.000Z",
    queuedAt: "2026-09-23T00:00:00.000Z",
    startedAt: null,
    endedAt: null,
    lastActivityAt: null,
    activity: null,
    retry: null,
    verdict: null,
    usage: ZERO_USAGE,
    queuePosition: 1,
    ...overrides,
  };
}

export function createWorkerDetail(overrides: Partial<WorkerDetail> = {}): WorkerDetail {
  return {
    summary: createWorkerSummary(),
    projectPath: "C:\\code\\demo",
    sessionRef: null,
    thinking: null,
    runs: [],
    ...overrides,
  };
}

export function createPoolView(overrides: Partial<PoolView> = {}): PoolView {
  return {
    id: "default",
    label: "默认池",
    model: "mcgrox/deepseek-v4.1-flash",
    capacity: 20,
    perProjectCap: null,
    running: 0,
    queued: 0,
    slots: [],
    queuedByProject: [],
    health: { windowMinutes: 60, completed: 0, failed: 0, retrying: 0 },
    usageToday: ZERO_USAGE,
    ...overrides,
  };
}

export function createRoleView(overrides: Partial<RoleView> = {}): RoleView {
  return {
    id: "test",
    label: "测试",
    description: "跑测试用的角色",
    ...overrides,
  };
}

export function createSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    version: "0.1.0-test",
    serverTime: "2026-09-23T00:00:00.000Z",
    pools: [createPoolView()],
    projects: [],
    workers: [],
    roles: [createRoleView()],
    configError: null,
    ...overrides,
  };
}

/**
 * 测试只需要「文字」这一种时间线事件（用于验证 seq 排序、去重、批量推送），
 * 不需要覆盖时间线事件的全部种类，所以固定 kind: "text"，只让 seq 必填。
 */
export function createTimelineEvent(params: {
  seq: number;
  runSeq?: number;
  text?: string;
}): TimelineEvent {
  return {
    seq: params.seq,
    runSeq: params.runSeq ?? 1,
    at: "2026-09-23T00:00:00.000Z",
    kind: "text",
    text: params.text ?? `事件 ${params.seq}`,
  };
}
