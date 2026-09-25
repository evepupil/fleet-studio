import { addUsage, FleetError, ZERO_USAGE } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { finishRun, resolveAndFinishRun } from "../../src/engine/finisher.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./support/records.js";
import { createTestEngine, type TestEngine } from "./support/testEngine.js";

function seedRunningRun(
  engine: TestEngine,
  runOverrides: Parameters<typeof createRunRecord>[0] = {},
) {
  const worker = createWorkerRecord();
  const run = createRunRecord({
    status: "running",
    startedAt: "2026-01-01T00:00:01.000Z",
    ...runOverrides,
  });
  engine.repos.projects.insert(createProjectRecord({ key: worker.projectKey, path: worker.cwd }));
  engine.repos.workers.insert(worker);
  engine.repos.runs.insert(run);
  return { worker, run };
}

describe("finishRun：收尾（模块设计 3.7）", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = await createTestEngine();
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("一次性写入状态、失败原因、说明、结束时间、退出码、用量、清空重试、活动、回报原文、事件数", async () => {
    const { worker, run } = seedRunningRun(engine);
    const usage = addUsage(ZERO_USAGE, { ...ZERO_USAGE, inputTokens: 42 });

    await finishRun(engine.ctx, {
      run,
      worker,
      outcome: { status: "completed", failReason: null, message: null },
      exitCode: 0,
      usage,
      activity: "bash · pnpm test",
      finalText: "SUMMARY: 完成\nSELF_REPORT: pass",
      eventCount: 5,
    });

    const updated = engine.repos.runs.get(run.id);
    expect(updated?.status).toBe("completed");
    expect(updated?.failReason).toBeNull();
    expect(updated?.errorMessage).toBeNull();
    expect(updated?.endedAt).not.toBeNull();
    expect(updated?.exitCode).toBe(0);
    expect(updated?.usage).toEqual(usage);
    expect(updated?.retry).toBeNull();
    expect(updated?.activity).toBe("bash · pnpm test");
    expect(updated?.finalText).toContain("完成");
    expect(updated?.eventCount).toBe(5);
  });

  it("收尾时记录 endedAt 与 startedAt 的毫秒差", async () => {
    const { worker, run } = seedRunningRun(engine, {
      startedAt: "2026-01-01T00:00:03.000Z",
    });
    engine.setNow(Date.parse("2026-01-01T00:00:10.000Z"));

    await finishRun(engine.ctx, {
      run,
      worker,
      outcome: { status: "completed", failReason: null, message: null },
      exitCode: 0,
      usage: run.usage,
      activity: run.activity,
      finalText: run.finalText,
      eventCount: run.eventCount,
    });

    expect(engine.repos.runs.get(run.id)?.runMs).toBe(7000);
  });

  it("未开跑就结束的运行 runMs 保持 null", async () => {
    const { worker, run } = seedRunningRun(engine, { status: "queued", startedAt: null });

    await finishRun(engine.ctx, {
      run,
      worker,
      outcome: { status: "failed", failReason: "pool_removed", message: "池已删除" },
      exitCode: null,
      usage: run.usage,
      activity: run.activity,
      finalText: run.finalText,
      eventCount: run.eventCount,
    });

    expect(engine.repos.runs.get(run.id)?.runMs).toBeNull();
  });

  it("刷新时间线：出现 run_end", async () => {
    const { worker, run } = seedRunningRun(engine);
    await finishRun(engine.ctx, {
      run,
      worker,
      outcome: { status: "failed", failReason: "runtime_error", message: "坏了" },
      exitCode: 1,
      usage: run.usage,
      activity: run.activity,
      finalText: run.finalText,
      eventCount: run.eventCount,
    });

    const page = await engine.ctx.timelines.timeline(worker.id, -1, 100);
    expect(page?.events.at(-1)).toMatchObject({
      kind: "run_end",
      status: "failed",
      failReason: "runtime_error",
    });
  });

  it("发 worker 和 snapshot 事件", async () => {
    const { worker, run } = seedRunningRun(engine);
    const seen: string[] = [];
    engine.ctx.events.subscribe((event) => seen.push(event.type));

    await finishRun(engine.ctx, {
      run,
      worker,
      outcome: { status: "cancelled", failReason: null, message: "已被取消" },
      exitCode: null,
      usage: run.usage,
      activity: run.activity,
      finalText: run.finalText,
      eventCount: run.eventCount,
    });

    expect(seen).toContain("worker");
    expect(seen).toContain("snapshot");
  });

  it("请求了一次放行", async () => {
    const { worker, run } = seedRunningRun(engine);
    let calls = 0;
    engine.ctx.requestDispatch = () => {
      calls += 1;
    };

    await finishRun(engine.ctx, {
      run,
      worker,
      outcome: { status: "completed", failReason: null, message: null },
      exitCode: 0,
      usage: run.usage,
      activity: run.activity,
      finalText: "干完了",
      eventCount: run.eventCount,
    });

    expect(calls).toBeGreaterThan(0);
  });

  it("已经是终态：直接返回 false，不报错、不再改库（评审 F4：重读优先于调用方传入的旧状态）", async () => {
    const { worker, run } = seedRunningRun(engine, {
      status: "completed",
      endedAt: "2026-01-01T00:00:05.000Z",
    });
    const before = engine.repos.runs.get(run.id);

    const finished = await finishRun(engine.ctx, {
      run,
      worker,
      outcome: { status: "completed", failReason: null, message: null },
      exitCode: 0,
      usage: run.usage,
      activity: run.activity,
      finalText: run.finalText,
      eventCount: run.eventCount,
    });

    expect(finished).toBe(false);
    expect(engine.repos.runs.get(run.id)).toEqual(before);
    expect(
      engine.logger.records.some((r) => r.level === "info" && r.message.includes("completed")),
    ).toBe(true);
  });

  it("非法的状态流转（排队中直接判完成）仍然会抛 FleetError", async () => {
    const { worker, run } = seedRunningRun(engine, { status: "queued" });

    await expect(
      finishRun(engine.ctx, {
        run,
        worker,
        outcome: { status: "completed", failReason: null, message: null },
        exitCode: 0,
        usage: run.usage,
        activity: run.activity,
        finalText: run.finalText,
        eventCount: run.eventCount,
      }),
    ).rejects.toBeInstanceOf(FleetError);
  });

  it("expectedStatus 不匹配（重读到的状态已经变了）：放弃收尾，返回 false", async () => {
    const { worker, run } = seedRunningRun(engine, { status: "running" });

    const finished = await finishRun(engine.ctx, {
      run,
      worker,
      outcome: { status: "failed", failReason: "runtime_error", message: "坏了" },
      exitCode: 1,
      usage: run.usage,
      activity: run.activity,
      finalText: run.finalText,
      eventCount: run.eventCount,
      expectedStatus: "queued", // 实际是 running，不符合期望
    });

    expect(finished).toBe(false);
    expect(engine.repos.runs.get(run.id)?.status).toBe("running");
  });

  it("finishRun 成功收尾时返回 true", async () => {
    const { worker, run } = seedRunningRun(engine);
    const finished = await finishRun(engine.ctx, {
      run,
      worker,
      outcome: { status: "completed", failReason: null, message: null },
      exitCode: 0,
      usage: run.usage,
      activity: run.activity,
      finalText: "完成",
      eventCount: run.eventCount,
    });
    expect(finished).toBe(true);
  });
});

describe("resolveAndFinishRun：先判定结局再收尾", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = await createTestEngine();
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("用传入 run 的 killedBy（而不是内存里可能过期的值）判定结局：cancel 优先于事件流的失败结局", async () => {
    const { worker, run } = seedRunningRun(engine);
    // 模拟 cancel() 抢先一步把 killedBy 写进库里；resolveAndFinishRun 拿到的 run 参数必须反映这个最新值。
    engine.repos.runs.update(run.id, { killedBy: "cancel" });
    const freshRun = engine.repos.runs.get(run.id);
    if (freshRun === null) {
      throw new Error("运行应该还在");
    }

    await resolveAndFinishRun(engine.ctx, {
      run: freshRun,
      worker,
      progress: {
        sessionRef: null,
        phase: "working",
        outcome: { status: "failed", reason: "model_error", message: "通道坏了" },
        retry: null,
        usage: ZERO_USAGE,
        activity: null,
        lastEventAt: null,
        finalText: null,
        plainOutputTail: null,
        model: null,
        eventCount: 0,
      },
      exit: { kind: "exited", code: null, signal: "SIGKILL" },
    });

    const updated = engine.repos.runs.get(run.id);
    expect(updated?.status).toBe("cancelled");
    expect(updated?.errorMessage).toBe("已被取消");
  });

  it("退出码非零且事件流没解释：失败 exit_code，说明带退出码", async () => {
    const { worker, run } = seedRunningRun(engine);
    await resolveAndFinishRun(engine.ctx, {
      run,
      worker,
      progress: {
        sessionRef: null,
        phase: "working",
        outcome: null,
        retry: null,
        usage: ZERO_USAGE,
        activity: null,
        lastEventAt: null,
        finalText: null,
        plainOutputTail: null,
        model: null,
        eventCount: 0,
      },
      exit: { kind: "exited", code: 7, signal: null },
    });

    const updated = engine.repos.runs.get(run.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.failReason).toBe("exit_code");
    expect(updated?.errorMessage).toContain("7");
  });
});
