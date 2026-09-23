import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { identityOfRun } from "../../src/engine/identity.js";
import { runTimeoutSweep } from "../../src/engine/timeouts.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./support/records.js";
import { createTestEngine, type TestEngine } from "./support/testEngine.js";

function seed(engine: TestEngine, run: ReturnType<typeof createRunRecord>) {
  const worker = createWorkerRecord();
  engine.repos.projects.insert(createProjectRecord({ key: worker.projectKey, path: worker.cwd }));
  engine.repos.workers.insert(worker);
  engine.repos.runs.insert(run);
  return worker;
}

describe("runTimeoutSweep：超时兜底检查（模块设计 3.8）", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = await createTestEngine({ initialNowMs: Date.parse("2026-01-01T01:00:00.000Z") });
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("工作中超时且进程号已知：写 killedBy=timeout 并结束进程", async () => {
    const pid = 3333;
    engine.host.registerExistingProcess(pid, true);
    const run = createRunRecord({
      status: "running",
      startedAt: "2026-01-01T00:00:00.000Z",
      timeoutMs: 30 * 60_000,
      pid,
      processImage: "fake-runtime.exe",
    });
    seed(engine, run);

    await runTimeoutSweep(engine.ctx);

    expect(engine.host.killedPids).toContain(pid);
    expect(engine.repos.runs.get(run.id)?.killedBy).toBe("timeout");
    // 收尾是退出流程的事，超时检查本身不改状态。
    expect(engine.repos.runs.get(run.id)?.status).toBe("running");
    // 身份核对：这条运行没有 spawnedAt（旧记录），身份里的时刻要按 startedAt + 启动超时算。
    const killCall = engine.host.killCalls.find((call) => call.pid === pid);
    expect(killCall?.identity).toEqual(identityOfRun(run));
  });

  it("工作中超时但进程号还没拿到：这一轮跳过，不报错、不改任何字段", async () => {
    const run = createRunRecord({
      status: "running",
      startedAt: "2026-01-01T00:00:00.000Z",
      timeoutMs: 30 * 60_000,
      pid: null,
    });
    seed(engine, run);

    await expect(runTimeoutSweep(engine.ctx)).resolves.toBeUndefined();

    expect(engine.repos.runs.get(run.id)?.killedBy).toBeNull();
    expect(engine.repos.runs.get(run.id)?.status).toBe("running");
  });

  it("排队超时：直接收尾为失败 queue_timeout，说明「排队超过 N 分钟」", async () => {
    const run = createRunRecord({
      status: "queued",
      queuedAt: "2026-01-01T00:00:00.000Z",
      queueTimeoutMs: 30 * 60_000,
    });
    seed(engine, run);

    await runTimeoutSweep(engine.ctx);

    const updated = engine.repos.runs.get(run.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.failReason).toBe("queue_timeout");
    expect(updated?.errorMessage).toBe("排队超过 30 分钟");
  });

  it("排队不限时（queueTimeoutMs 为 null）：永远不超时", async () => {
    const run = createRunRecord({
      status: "queued",
      queuedAt: "2026-01-01T00:00:00.000Z",
      queueTimeoutMs: null,
    });
    seed(engine, run);

    await runTimeoutSweep(engine.ctx);

    expect(engine.repos.runs.get(run.id)?.status).toBe("queued");
  });

  it("还没到超时点的运行不受影响", async () => {
    const run = createRunRecord({
      status: "running",
      startedAt: "2026-01-01T00:59:00.000Z",
      timeoutMs: 30 * 60_000,
      pid: 1,
    });
    engine.host.registerExistingProcess(1, true);
    seed(engine, run);

    await runTimeoutSweep(engine.ctx);

    expect(engine.repos.runs.get(run.id)?.killedBy).toBeNull();
    expect(engine.host.killedPids).toHaveLength(0);
  });

  it("F3 回归：killedBy 已经被取消抢先写过，超时检查不会覆盖成 timeout，也不会再抢着杀进程", async () => {
    const pid = 4444;
    engine.host.registerExistingProcess(pid, true);
    const run = createRunRecord({
      status: "running",
      startedAt: "2026-01-01T00:00:00.000Z",
      timeoutMs: 30 * 60_000,
      pid,
      processImage: "fake-runtime.exe",
      killedBy: "cancel",
    });
    seed(engine, run);

    await runTimeoutSweep(engine.ctx);

    expect(engine.repos.runs.get(run.id)?.killedBy).toBe("cancel");
    expect(engine.host.killedPids).toHaveLength(0);
  });

  it("F1 回归：处理 A 的收尾期间 B 被放行成 running，不会被误杀成 queue_timeout", async () => {
    const workerA = createWorkerRecord({ id: "waaaaa1" });
    const runA = createRunRecord({
      id: "waaaaa1.1",
      workerId: "waaaaa1",
      status: "queued",
      queuedAt: "2026-01-01T00:00:00.000Z",
      queueTimeoutMs: 30 * 60_000,
    });
    engine.repos.projects.insert(
      createProjectRecord({ key: workerA.projectKey, path: workerA.cwd }),
    );
    engine.repos.workers.insert(workerA);
    engine.repos.runs.insert(runA);

    const workerB = createWorkerRecord({
      id: "wbbbbb1",
      projectKey: "c:\\code\\b",
      cwd: "C:\\code\\b",
    });
    const runB = createRunRecord({
      id: "wbbbbb1.1",
      workerId: "wbbbbb1",
      status: "queued",
      queuedAt: "2026-01-01T00:00:00.000Z",
      queueTimeoutMs: 30 * 60_000,
    });
    engine.repos.projects.insert(
      createProjectRecord({ key: workerB.projectKey, path: workerB.cwd }),
    );
    engine.repos.workers.insert(workerB);
    engine.repos.runs.insert(runB);

    // finishRun 收尾 A 时会调用 timelines.refresh；这里借它模拟评审描述的原始竞态：
    // 「处理 A 期间，B 被放行成了工作中」。
    const originalRefresh = engine.ctx.timelines.refresh;
    let injected = false;
    engine.ctx.timelines.refresh = async (workerId: string): Promise<void> => {
      if (workerId === workerA.id && !injected) {
        injected = true;
        engine.repos.runs.update(runB.id, {
          status: "running",
          startedAt: "2026-01-01T00:30:00.000Z",
        });
      }
      return originalRefresh(workerId);
    };

    await runTimeoutSweep(engine.ctx);

    expect(engine.repos.runs.get(runA.id)?.status).toBe("failed");
    expect(engine.repos.runs.get(runA.id)?.failReason).toBe("queue_timeout");
    // B 已经在工作中了，不能被同一轮超时检查误判成排队超时收尾掉。
    expect(engine.repos.runs.get(runB.id)?.status).toBe("running");
  });
});
