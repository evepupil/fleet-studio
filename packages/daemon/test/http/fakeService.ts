import type {
  HealthInfo,
  ListWorkersQuery,
  PoolPatch,
  PoolView,
  ProjectInfo,
  RoleView,
  SendRequest,
  Snapshot,
  StatsQuery,
  StatsResponse,
  SubmitRequest,
  TaskPage,
  TasksQuery,
  TimelinePage,
  WaitResult,
  WorkerDetail,
  WorkerSummary,
} from "@fleet/core";
import { vi } from "vitest";
import type { FleetService, ServiceEvent } from "../../src/engine/service.js";
import { createHealth, createSnapshot, createStatsResponse, createTaskPage } from "./fixtures.js";

/**
 * 假服务：实现接口层唯一依赖的 FleetService 契约，方法全部是 vi.fn()，
 * 默认行为给个跑得通的值，单个测试按需重写某个方法或调用 mockImplementation /
 * mockResolvedValue 等来定制。emit() 用来模拟调度引擎发出的服务事件。
 */
export interface FakeService extends FleetService {
  /** 手动触发一次服务事件，模拟状态变化，SSE 路由会拿到这个事件。 */
  emit(event: ServiceEvent): void;
  /** 当前还有多少个活跃订阅；客户端断开后应该归零，测试用它验证取消订阅。 */
  listenerCount(): number;
}

export function createFakeService(overrides: Partial<FleetService> = {}): FakeService {
  const listeners = new Set<(event: ServiceEvent) => void>();

  const defaults: FleetService = {
    health: vi.fn((): HealthInfo => createHealth()),
    snapshot: vi.fn((): Snapshot => createSnapshot()),
    listWorkers: vi.fn((_query: ListWorkersQuery): WorkerSummary[] => []),
    getWorker: vi.fn((_id: string): WorkerDetail | null => null),
    timeline: vi.fn(
      async (_id: string, after: number): Promise<TimelinePage | null> => ({
        events: [],
        next: after,
        total: 0,
      }),
    ),
    submit: vi.fn((_request: SubmitRequest): Promise<WorkerSummary> => {
      throw new Error("测试没有配置 submit 的行为");
    }),
    send: vi.fn((_id: string, _request: SendRequest): Promise<WorkerSummary> => {
      throw new Error("测试没有配置 send 的行为");
    }),
    cancel: vi.fn((_id: string): Promise<WorkerSummary> => {
      throw new Error("测试没有配置 cancel 的行为");
    }),
    wait: vi.fn(
      async (_ids: readonly string[]): Promise<WaitResult> => ({
        done: [],
        pending: [],
        timedOut: true,
      }),
    ),
    pools: vi.fn((): PoolView[] => []),
    patchPool: vi.fn((_id: string, _patch: PoolPatch): Promise<PoolView> => {
      throw new Error("测试没有配置 patchPool 的行为");
    }),
    setPoolEnabled: vi.fn((_id: string, _enabled: boolean): Promise<PoolView> => {
      throw new Error("测试没有配置 setPoolEnabled 的行为");
    }),
    reorderPools: vi.fn((_poolIds: readonly string[]): Promise<PoolView[]> => {
      throw new Error("测试没有配置 reorderPools 的行为");
    }),
    stats: vi.fn((_query: StatsQuery): StatsResponse => createStatsResponse()),
    tasks: vi.fn((_query: TasksQuery): TaskPage => createTaskPage()),
    projects: vi.fn((): ProjectInfo[] => []),
    roles: vi.fn((): RoleView[] => []),
    subscribe: (listener: (event: ServiceEvent) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    requestShutdown: vi.fn(() => {}),
    ...overrides,
  };

  return {
    ...defaults,
    emit: (event) => {
      for (const listener of listeners) {
        listener(event);
      }
    },
    listenerCount: () => listeners.size,
  };
}
