import { FleetError } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./support/records.js";
import { createTestEngine, type TestEngine } from "./support/testEngine.js";

function seed(engine: TestEngine, run: ReturnType<typeof createRunRecord>) {
  const worker = createWorkerRecord({ id: run.workerId });
  if (engine.repos.projects.get(worker.projectKey) === null) {
    engine.repos.projects.insert(createProjectRecord({ key: worker.projectKey, path: worker.cwd }));
  }
  engine.repos.workers.insert(worker);
  engine.repos.runs.insert(run);
  return worker;
}

describe("waiter.wait：等苦工结束（模块设计 3.12）", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = await createTestEngine();
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("编号不存在时抛 not_found", async () => {
    await expect(
      engine.ctx.waiter.wait(["wnoexist"], "all", 100, new AbortController().signal),
    ).rejects.toBeInstanceOf(FleetError);
  });

  it("已经是终态：立即返回，timedOut 为 false", async () => {
    const run = createRunRecord({
      workerId: "wone01",
      status: "completed",
      endedAt: "2026-01-01T00:00:05.000Z",
    });
    seed(engine, run);

    const result = await engine.ctx.waiter.wait(
      ["wone01"],
      "all",
      5000,
      new AbortController().signal,
    );
    expect(result.timedOut).toBe(false);
    expect(result.pending).toEqual([]);
    expect(result.done.map((d) => d.id)).toEqual(["wone01"]);
  });

  it("mode=any：两个里有一个终态就满足，不用等另一个", async () => {
    seed(
      engine,
      createRunRecord({
        id: "wdone1.1",
        workerId: "wdone1",
        status: "completed",
        endedAt: "2026-01-01T00:00:05.000Z",
      }),
    );
    seed(
      engine,
      createRunRecord({
        id: "wbusy1.1",
        workerId: "wbusy1",
        status: "running",
        startedAt: "2026-01-01T00:00:01.000Z",
      }),
    );

    const result = await engine.ctx.waiter.wait(
      ["wdone1", "wbusy1"],
      "any",
      5000,
      new AbortController().signal,
    );
    expect(result.timedOut).toBe(false);
    expect(result.done.map((d) => d.id)).toEqual(["wdone1"]);
    expect(result.pending).toEqual(["wbusy1"]);
  });

  it("一直没结束：超过 timeoutMs 后返回 timedOut=true", async () => {
    seed(
      engine,
      createRunRecord({
        workerId: "wstuck1",
        status: "running",
        startedAt: "2026-01-01T00:00:01.000Z",
      }),
    );

    const result = await engine.ctx.waiter.wait(
      ["wstuck1"],
      "all",
      50,
      new AbortController().signal,
    );
    expect(result.timedOut).toBe(true);
    expect(result.pending).toEqual(["wstuck1"]);
  });

  it("中止信号触发时立即返回 timedOut=true，不用等到 timeoutMs", async () => {
    seed(
      engine,
      createRunRecord({
        workerId: "wstuck2",
        status: "running",
        startedAt: "2026-01-01T00:00:01.000Z",
      }),
    );
    const controller = new AbortController();

    const promise = engine.ctx.waiter.wait(["wstuck2"], "all", 5000, controller.signal);
    controller.abort();
    const result = await promise;

    expect(result.timedOut).toBe(true);
  });

  it("运行途中结束：wait 应该在事件到达后就返回，不用等到超时", async () => {
    const run = createRunRecord({
      workerId: "wlive01",
      status: "running",
      startedAt: "2026-01-01T00:00:01.000Z",
    });
    seed(engine, run);

    const promise = engine.ctx.waiter.wait(["wlive01"], "all", 5000, new AbortController().signal);

    engine.repos.runs.update(run.id, { status: "completed", endedAt: "2026-01-01T00:00:10.000Z" });
    engine.ctx.notifyWorker("wlive01");

    const result = await promise;
    expect(result.timedOut).toBe(false);
    expect(result.done.map((d) => d.id)).toEqual(["wlive01"]);
  });
});
