import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
});
