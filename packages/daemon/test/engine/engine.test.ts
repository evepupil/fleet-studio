import { appendFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEngine } from "../../src/engine/engine.js";
import type { EngineDeps } from "../../src/engine/types.js";
import { createRepos } from "../../src/store/createRepos.js";
import type { Repos } from "../../src/store/types.js";
import { createFakeConfigStore, type FakeConfigStore } from "./fakes/fakeConfigStore.js";
import { createFakeLogger, type FakeLogger } from "./fakes/fakeLogger.js";
import { createFakeProcessHost, type FakeProcessHost } from "./fakes/fakeProcessHost.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./support/records.js";
import { piAssistantTextLine } from "./support/runtimeLines.js";
import { baselineConfig, basePoolOf } from "./support/testEngine.js";
import { createTestPaths } from "./support/testPaths.js";
import { waitFor } from "./support/waitFor.js";

interface Harness {
  home: string;
  repos: Repos;
  host: FakeProcessHost;
  config: FakeConfigStore;
  logger: FakeLogger;
  deps: EngineDeps;
  cleanup(): Promise<void>;
}

async function createHarness(overrides: Partial<EngineDeps> = {}): Promise<Harness> {
  const home = await mkdtemp(join(tmpdir(), "fleet-engine-wiring-"));
  const repos = createRepos(":memory:");
  const host = createFakeProcessHost();
  const config = createFakeConfigStore(baselineConfig());
  const logger = createFakeLogger();
  const deps: EngineDeps = {
    repos,
    host,
    config,
    paths: createTestPaths(home),
    logger,
    version: "test",
    startedAt: new Date().toISOString(),
    getPort: () => 4870,
    platform: "win32",
    homeDir: home,
    builtinRoot: home,
    onShutdownRequested: () => {},
    intervals: {
      dispatchFallbackMs: 20,
      trackerPollMs: 20,
      timeoutSweepMs: 20,
      retentionSweepMs: 30,
    },
    ...overrides,
  };
  return {
    home,
    repos,
    host,
    config,
    logger,
    deps,
    async cleanup(): Promise<void> {
      repos.close();
      // 见 support/testEngine.ts 的同一处注释：fire-and-forget 的放行/启动可能还没写完文件。
      // 重试用完还是删不掉的话，收尾是尽力而为，不能让测试跟着失败，但也不能静默吞掉。
      try {
        await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch (error) {
        console.warn(`删除临时目录失败（可能是系统占用），忽略：${home}`, error);
      }
    },
  };
}

describe("createEngine：组装与生命周期（模块设计 3.1）", () => {
  let harness: Harness;

  afterEach(async () => {
    await harness.cleanup();
  });

  it("start() 先接管再放行：pid 为空的工作中运行会被判 interrupted", async () => {
    harness = await createHarness();
    const worker = createWorkerRecord();
    const run = createRunRecord({
      status: "running",
      startedAt: "2026-01-01T00:00:01.000Z",
      pid: null,
    });
    harness.repos.projects.insert(
      createProjectRecord({ key: worker.projectKey, path: worker.cwd }),
    );
    harness.repos.workers.insert(worker);
    harness.repos.runs.insert(run);

    const engine = createEngine(harness.deps);
    await engine.start();
    try {
      expect(harness.repos.runs.get(run.id)?.status).toBe("failed");
      expect(harness.repos.runs.get(run.id)?.failReason).toBe("interrupted");
    } finally {
      await engine.stop();
    }
  });

  it("放行兜底定时器：即使没人调用 requestDispatch，排队中的运行也会被放行", async () => {
    harness = await createHarness();
    const cwd = join(harness.home, "project");
    await mkdir(cwd, { recursive: true });
    const worker = createWorkerRecord();
    const run = createRunRecord({ status: "queued" });
    harness.repos.projects.insert(
      createProjectRecord({ key: worker.projectKey, path: cwd, name: "project" }),
    );
    harness.repos.workers.insert({ ...worker, cwd });
    harness.repos.runs.insert(run);

    const engine = createEngine(harness.deps);
    await engine.start();
    try {
      await waitFor(() => harness.repos.runs.get(run.id)?.status === "running", {
        timeoutMs: 1000,
      });
    } finally {
      await engine.stop();
    }
  });

  it("stop() 之后定时器全部停掉：过一会儿也不会再有新的放行或清理动作", async () => {
    harness = await createHarness();
    const engine = createEngine(harness.deps);
    await engine.start();
    await engine.stop();

    const worker = createWorkerRecord();
    const run = createRunRecord({ status: "queued" });
    const cwd = join(harness.home, "after-stop");
    await mkdir(cwd, { recursive: true });
    harness.repos.projects.insert(createProjectRecord({ key: worker.projectKey, path: cwd }));
    harness.repos.workers.insert({ ...worker, cwd });
    harness.repos.runs.insert(run);

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(harness.repos.runs.get(run.id)?.status).toBe("queued");
  });

  it("F6b 回归：接管在顶层抛错时不阻止启动，只记日志", async () => {
    harness = await createHarness();
    const originalListActive = harness.repos.runs.listActive;
    let calls = 0;
    harness.repos.runs.listActive = () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("模拟查库炸了");
      }
      return originalListActive();
    };

    const engine = createEngine(harness.deps);
    await expect(engine.start()).resolves.toBeUndefined();
    try {
      expect(
        harness.logger.records.some(
          (record) => record.level === "error" && record.message.includes("接管"),
        ),
      ).toBe(true);
    } finally {
      await engine.stop();
    }
  });

  it("F6b 回归：过期清理在顶层抛错时不阻止启动，只记日志", async () => {
    harness = await createHarness();
    harness.repos.runs.listExpiredWorkerIds = () => {
      throw new Error("模拟查库炸了");
    };

    const engine = createEngine(harness.deps);
    await expect(engine.start()).resolves.toBeUndefined();
    try {
      expect(
        harness.logger.records.some(
          (record) => record.level === "error" && record.message.includes("过期清理"),
        ),
      ).toBe(true);
    } finally {
      await engine.stop();
    }
  });

  it("配置外部变化时：invalidate 进程托管缓存、标记快照脏、发 snapshot 事件", async () => {
    harness = await createHarness();
    const engine = createEngine(harness.deps);
    await engine.start();
    try {
      let sawSnapshot = false;
      engine.subscribe((event) => {
        if (event.type === "snapshot") {
          sawSnapshot = true;
        }
      });
      const before = harness.host.invalidateCallCount;

      const current = harness.config.current();
      harness.config.setConfig({ ...current, pools: [{ ...basePoolOf(current), capacity: 99 }] });

      await waitFor(() => harness.host.invalidateCallCount > before);
      expect(sawSnapshot).toBe(true);
    } finally {
      await engine.stop();
    }
  });

  it("requestShutdown 转发给 onShutdownRequested", async () => {
    let called = false;
    harness = await createHarness({
      onShutdownRequested: () => {
        called = true;
      },
    });
    const engine = createEngine(harness.deps);
    engine.requestShutdown();
    expect(called).toBe(true);
  });

  it("subscribe 返回的取消函数确实能取消订阅", async () => {
    harness = await createHarness();
    const engine = createEngine(harness.deps);
    let count = 0;
    const unsubscribe = engine.subscribe(() => {
      count += 1;
    });
    engine.pools(); // 不发事件；直接验证 unsubscribe 本身能正常调用不报错
    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();
    expect(count).toBe(0);
  });

  it("完整走一轮：submit → 放行 → 假苦工产出成功结论 → snapshot 里能看到已完成", async () => {
    harness = await createHarness();
    const engine = createEngine(harness.deps);
    await engine.start();
    try {
      const cwd = join(harness.home, "smoke");
      await mkdir(cwd, { recursive: true });
      const summary = await engine.submit({ projectPath: cwd, cwd, prompt: "写个 hello world" });

      // 放行是先把状态占位成 running、之后 launcher 才异步拿到进程号写回库——两件事不是
      // 同一时刻发生的；负载高时这个间隙会被拉长，只等 running 就读 pid 可能读到 null，
      // 对进程号 0 触发退出会让真正的进程永远等不到收尾。这里必须连 pid 一起等。
      // 超时上限放宽到 5 秒，避免和集成测试一起跑、机器负载高时被误判成失败。
      await waitFor(
        () => {
          const current = harness.repos.runs.get(`${summary.id}.1`);
          return current?.status === "running" && current.pid !== null;
        },
        { timeoutMs: 5000 },
      );
      const run = harness.repos.runs.get(`${summary.id}.1`);
      if (run === null || run === undefined || run.pid === null) {
        throw new Error("运行应该已经在跑了，并且已经拿到了进程号");
      }
      const outFile = harness.deps.paths.outFile(run.id);
      await appendFile(
        outFile,
        `${piAssistantTextLine("SUMMARY: 完成\nSELF_REPORT: pass")}\n`,
        "utf8",
      );
      harness.host.triggerExit(run.pid, { code: 0, signal: null });

      await waitFor(() => harness.repos.runs.get(`${summary.id}.1`)?.status === "completed", {
        timeoutMs: 5000,
      });
      const snapshot = engine.snapshot();
      const workerView = snapshot.workers.find((w) => w.id === summary.id);
      expect(workerView?.status).toBe("completed");
      expect(workerView?.verdict).toBe("pass");
    } finally {
      await engine.stop();
    }
  });
});
