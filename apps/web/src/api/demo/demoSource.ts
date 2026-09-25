import {
  computeStats,
  type FleetConfig,
  type PoolView,
  type ProjectInfo,
  type RunRecord,
  type Snapshot,
  type StatsQuery,
  type StatsResponse,
  type TaskPage,
  type TasksQuery,
  type TimeZone,
  type WorkerRecord,
} from "@fleet/core";
import type { DataSource, WorkerHandlers } from "../dataSource";
import { demoStatsLabels, runFactsOf, workerFactsOf } from "./facts";
import {
  buildDemoScenario,
  buildDemoSnapshot,
  type DemoScenario,
  type DemoScenarioName,
} from "./scenarios";
import { demoSummaries } from "./scheduling";
import { queryDemoTasks } from "./taskQuery";

/**
 * 演示数据源：不起服务也能把三页画出来。记录是固定的，只有池的启用状态和顺序可变。
 * 快照、统计、任务查询都用核心层的同一套纯函数算，口径和真实服务一致。
 */

/** offline 场景先报 open，300 毫秒后报 lost */
const OFFLINE_DROP_DELAY_MS = 300;
/** 统计和任务查询的假延迟 */
const QUERY_DELAY_MS = 150;
/** 改设置的假延迟 */
const MUTATION_DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const noop = (): void => undefined;

export function createDemoDataSource(name: DemoScenarioName): DataSource {
  const scenario: DemoScenario = buildDemoScenario(name);
  const tz: TimeZone = {
    offsetMinutes: (ms: number): number => -new Date(ms).getTimezoneOffset(),
  };

  // 只有配置是可变的：池的启用状态和顺序。记录本身固定。
  let config: FleetConfig = scenario.config;
  const workers: readonly WorkerRecord[] = scenario.workers;
  const runs: readonly RunRecord[] = scenario.runs;
  const details = scenario.details;
  const timelines = scenario.timelines;
  const nowMs = Date.parse(scenario.snapshot.serverTime);

  const subscribers = new Set<(snapshot: Snapshot) => void>();
  let snapshot = scenario.snapshot;

  function rebuild(): void {
    snapshot = buildDemoSnapshot(config, scenario.snapshot.configError, workers, runs, tz);
    for (const subscriber of subscribers) {
      subscriber(snapshot);
    }
  }

  function summaries(): ReturnType<typeof demoSummaries> {
    return demoSummaries(config, workers, runs, nowMs);
  }

  return {
    subscribeSnapshot(onSnapshot, onConnection) {
      subscribers.add(onSnapshot);
      onSnapshot(snapshot);
      onConnection("open");
      if (scenario.connection !== "lost") {
        return () => {
          subscribers.delete(onSnapshot);
        };
      }
      const timer = setTimeout(() => onConnection("lost"), OFFLINE_DROP_DELAY_MS);
      return () => {
        clearTimeout(timer);
        subscribers.delete(onSnapshot);
      };
    },

    subscribeWorker(id, _after, handlers: WorkerHandlers) {
      const detail = details.get(id);
      if (detail === undefined) {
        handlers.onNotFound();
        return noop;
      }
      handlers.onDetail(detail);
      handlers.onEvents(timelines.get(id) ?? []);
      return noop;
    },

    fixedNow: () => nowMs,

    async getStats(query: StatsQuery): Promise<StatsResponse> {
      await delay(QUERY_DELAY_MS);
      return computeStats({
        range: { kind: query.range, from: query.from, to: query.to },
        dimension: query.dimension,
        nowMs,
        tz,
        runs: runFactsOf(runs),
        workers: workerFactsOf(workers),
        labels: demoStatsLabels(scenario.projects, config),
      });
    },

    async getTasks(query: TasksQuery): Promise<TaskPage> {
      await delay(QUERY_DELAY_MS);
      return queryDemoTasks(summaries(), query, nowMs, tz);
    },

    async getProjects(): Promise<ProjectInfo[]> {
      return scenario.projects
        .map((project) => ({
          key: project.key,
          path: project.path,
          name: project.name,
          colorIndex: project.colorIndex,
        }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },

    async setPoolEnabled(poolId: string, enabled: boolean): Promise<PoolView> {
      await delay(MUTATION_DELAY_MS);
      const index = config.pools.findIndex((pool) => pool.id === poolId);
      if (index < 0) {
        throw new Error(`池不存在：${poolId}`);
      }
      config = {
        ...config,
        pools: config.pools.map((pool, position) =>
          position === index ? { ...pool, enabled } : pool,
        ),
      };
      rebuild();
      const view = snapshot.pools.find((pool) => pool.id === poolId);
      if (view === undefined) {
        throw new Error(`池不存在：${poolId}`);
      }
      return view;
    },

    async reorderPools(poolIds: readonly string[]): Promise<PoolView[]> {
      await delay(MUTATION_DELAY_MS);
      const current = config.pools.map((pool) => pool.id);
      const sameSize = poolIds.length === current.length;
      const unique = new Set(poolIds).size === poolIds.length;
      const covers = poolIds.every((id) => current.includes(id));
      if (!sameSize || !unique || !covers) {
        throw new Error("池的列表已经变了，请刷新后再调顺序");
      }
      const byId = new Map(config.pools.map((pool) => [pool.id, pool] as const));
      const ordered = poolIds.map((id) => {
        const pool = byId.get(id);
        if (pool === undefined) {
          throw new Error("池的列表已经变了，请刷新后再调顺序");
        }
        return pool;
      });
      config = { ...config, pools: ordered };
      rebuild();
      return snapshot.pools;
    },
  };
}
