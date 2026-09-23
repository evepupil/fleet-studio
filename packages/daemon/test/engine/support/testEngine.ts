/**
 * 引擎单测的公共装配：内存数据库 + 假进程托管 + 假配置存储 + 假日志 + 真实临时目录，
 * 拼出一份 EngineContext，测试直接调用 submit.ts / dispatcher.ts 等导出的函数，
 * 不必每个用例都重新组装一遍。
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, type FleetConfig, type PoolConfig, parseConfig } from "@fleet/core";
import { createDispatcher } from "../../../src/engine/dispatcher.js";
import { createEventBus } from "../../../src/engine/events.js";
import { createSnapshotService } from "../../../src/engine/snapshotService.js";
import { createTimelineStore } from "../../../src/engine/timelineStore.js";
import type { EngineContext, EngineDeps } from "../../../src/engine/types.js";
import { createWaiter } from "../../../src/engine/waiter.js";
import { createRepos } from "../../../src/store/createRepos.js";
import type { Repos } from "../../../src/store/types.js";
import { createFakeConfigStore, type FakeConfigStore } from "../fakes/fakeConfigStore.js";
import { createFakeLogger, type FakeLogger } from "../fakes/fakeLogger.js";
import {
  createFakeProcessHost,
  type FakeProcessHost,
  type FakeProcessHostOptions,
} from "../fakes/fakeProcessHost.js";
import { createTestPaths } from "./testPaths.js";

/** DEFAULT_CONFIG 经 parseConfig 一定成功（core 包自己的单测也验证了这一点），这里直接拿来当测试基线。 */
export function baselineConfig(): FleetConfig {
  const result = parseConfig(DEFAULT_CONFIG);
  if (!result.ok) {
    throw new Error(`默认配置解析失败：${result.issues.join("；")}`);
  }
  return result.config;
}

/**
 * 取配置里第一个池，方便测试用 `{ ...basePoolOf(config), capacity: 2 }` 这种写法改个别字段。
 * `config.pools[0]` 在 noUncheckedIndexedAccess 下类型是 `PoolConfig | undefined`，
 * 直接展开一个可能是 undefined 的值会让结果类型的所有字段变成可选，配不上 PoolConfig；
 * 这里做一次防御性检查，拿到一个确定非空的 PoolConfig 再交给调用方展开。
 */
export function basePoolOf(config: FleetConfig): PoolConfig {
  const pool = config.pools[0];
  if (pool === undefined) {
    throw new Error("测试配置应该至少有一个池");
  }
  return pool;
}

export interface TestEngine {
  ctx: EngineContext;
  repos: Repos;
  host: FakeProcessHost;
  config: FakeConfigStore;
  logger: FakeLogger;
  home: string;
  /** 直接把测试时钟改成绝对时间（毫秒）。 */
  setNow(ms: number): void;
  /** 把测试时钟往前拨若干毫秒，返回拨完之后的值。 */
  advanceNow(ms: number): number;
  cleanup(): Promise<void>;
}

export interface CreateTestEngineOptions {
  config?: FleetConfig;
  initialNowMs?: number;
  hostOptions?: FakeProcessHostOptions;
}

export async function createTestEngine(options: CreateTestEngineOptions = {}): Promise<TestEngine> {
  const home = await mkdtemp(join(tmpdir(), "fleet-engine-test-"));
  const repos = createRepos(":memory:");
  const host = createFakeProcessHost(options.hostOptions);
  const config = createFakeConfigStore(options.config ?? baselineConfig());
  const logger = createFakeLogger();
  const paths = createTestPaths(home);

  let nowMs = options.initialNowMs ?? Date.parse("2026-01-01T00:00:00.000Z");
  const now = (): number => nowMs;

  const deps: EngineDeps = {
    repos,
    host,
    config,
    paths,
    logger,
    version: "test",
    startedAt: new Date(nowMs).toISOString(),
    getPort: () => 4870,
    platform: "win32",
    homeDir: home,
    builtinRoot: home,
    now,
    onShutdownRequested: () => {},
  };

  const events = createEventBus(logger);
  const timelines = createTimelineStore({ repos, paths, logger, events });
  const snapshots = createSnapshotService({ repos, config, version: deps.version, now });
  const waiter = createWaiter({ repos, config, events });

  const ctx: EngineContext = {
    deps,
    now,
    events,
    timelines,
    snapshots,
    waiter,
    trackers: new Map(),
    requestDispatch: () => {},
    notifyWorker(workerId: string): void {
      events.emit({ type: "worker", workerId });
      snapshots.markDirty();
      events.emit({ type: "snapshot" });
    },
    notifySnapshot(): void {
      snapshots.markDirty();
      events.emit({ type: "snapshot" });
    },
  };
  const dispatcher = createDispatcher(ctx);
  ctx.requestDispatch = dispatcher.requestDispatch;

  return {
    ctx,
    repos,
    host,
    config,
    logger,
    home,
    setNow(ms: number): void {
      nowMs = ms;
    },
    advanceNow(ms: number): number {
      nowMs += ms;
      return nowMs;
    },
    async cleanup(): Promise<void> {
      repos.close();
      // 有些用例触发的放行/启动是「发出去不等」的（dispatcher 用 setImmediate 合并请求），
      // 测试函数本身返回时那些异步操作可能还没写完文件；Windows 上删除目录跟正在写的文件
      // 撞到一起会报 ENOTEMPTY/EBUSY，用 fs.rm 内置的重试退避几次就稳了。重试用完还是
      // 删不掉的话，收尾是尽力而为，不能让测试跟着失败，但也不能静默吞掉，打一行警告。
      try {
        await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch (error) {
        console.warn(`删除临时目录失败（可能是系统占用），忽略：${home}`, error);
      }
    },
  };
}
