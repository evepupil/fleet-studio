import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { FleetError, ZERO_USAGE } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sendToWorker, submitWorker } from "../../src/engine/submit.js";
import { createRunRecord, createWorkerRecord } from "./support/records.js";
import { createTestEngine, type TestEngine } from "./support/testEngine.js";
import { waitFor } from "./support/waitFor.js";

describe("submitWorker：派活校验与建档（模块设计 3.2）", () => {
  let engine: TestEngine;
  let cwd: string;

  beforeEach(async () => {
    engine = await createTestEngine();
    cwd = join(engine.home, "project");
    await mkdir(cwd, { recursive: true });
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("池不存在时抛 invalid_request", async () => {
    await expect(
      submitWorker(engine.ctx, { projectPath: cwd, cwd, prompt: "做点事", pool: "no-such-pool" }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("角色不存在时抛 invalid_request", async () => {
    await expect(
      submitWorker(engine.ctx, { projectPath: cwd, cwd, prompt: "做点事", role: "no-such-role" }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("未点名时进入公共队列，实际派活前不预设池和模型", async () => {
    engine.ctx.requestDispatch = () => {};
    const summary = await submitWorker(engine.ctx, { projectPath: cwd, cwd, prompt: "公共任务" });
    const worker = engine.repos.workers.get(summary.id);

    expect(worker).toMatchObject({
      requestedPool: null,
      poolId: null,
      model: null,
      channel: null,
      modelName: null,
    });
  });

  it("未点名时要求至少有一个池配置所选运行时的模型", async () => {
    const config = engine.config.current();
    engine.config.setConfig({
      ...config,
      pools: config.pools.map((pool) => ({ ...pool, runtimes: {} })),
    });

    await expect(
      submitWorker(engine.ctx, { projectPath: cwd, cwd, prompt: "公共任务" }),
    ).rejects.toMatchObject({ code: "invalid_request", message: expect.stringContaining("pi") });
  });

  it("点名停用池时抛 pool_disabled", async () => {
    const config = engine.config.current();
    engine.config.setConfig({
      ...config,
      pools: config.pools.map((pool) => ({ ...pool, enabled: false })),
    });

    await expect(
      submitWorker(engine.ctx, { projectPath: cwd, cwd, prompt: "指定池任务", pool: "dsf" }),
    ).rejects.toMatchObject({ code: "pool_disabled" });
  });

  it("公共队列超时采用全局默认，显式 null 可关闭排队超时", async () => {
    engine.ctx.requestDispatch = () => {};
    const config = engine.config.current();
    const defaultSummary = await submitWorker(engine.ctx, {
      projectPath: cwd,
      cwd,
      prompt: "默认",
    });
    const unlimitedSummary = await submitWorker(engine.ctx, {
      projectPath: cwd,
      cwd,
      prompt: "不限时",
      queueTimeoutMin: null,
    });

    expect(engine.repos.runs.get(`${defaultSummary.id}.1`)?.queueTimeoutMs).toBe(
      config.defaults.queueTimeoutMin === null ? null : config.defaults.queueTimeoutMin * 60_000,
    );
    expect(engine.repos.runs.get(`${unlimitedSummary.id}.1`)?.queueTimeoutMs).toBeNull();
  });

  it("池没有为选中的运行时指定模型时抛 invalid_request，说明带上池编号和运行时", async () => {
    const config = engine.config.current();
    engine.config.setConfig({
      ...config,
      pools: [
        ...config.pools,
        {
          id: "oc-only",
          label: "只有 opencode",
          capacity: 1,
          perProjectCap: null,
          runTimeoutMin: null,
          queueTimeoutMin: null,
          enabled: true,
          runtimes: { opencode: { model: "x" } },
        },
      ],
    });
    await expect(
      submitWorker(engine.ctx, {
        projectPath: cwd,
        cwd,
        prompt: "做点事",
        pool: "oc-only",
        runtime: "pi",
      }),
    ).rejects.toMatchObject({
      code: "invalid_request",
      message: expect.stringContaining("oc-only"),
    });
  });

  it("工作目录不是绝对路径时抛 invalid_request", async () => {
    await expect(
      submitWorker(engine.ctx, { projectPath: cwd, cwd: "relative/path", prompt: "做点事" }),
    ).rejects.toBeInstanceOf(FleetError);
  });

  it("工作目录不存在时抛 invalid_request，说明带上路径", async () => {
    const missing = join(engine.home, "not-there");
    await expect(
      submitWorker(engine.ctx, { projectPath: missing, cwd: missing, prompt: "做点事" }),
    ).rejects.toMatchObject({ code: "invalid_request", message: expect.stringContaining(missing) });
  });

  it("首次派活会新建项目，挑一个没被占用的配色", async () => {
    const summary = await submitWorker(engine.ctx, { projectPath: cwd, cwd, prompt: "做点事" });
    const project = engine.repos.projects.get(summary.projectKey);
    expect(project).not.toBeNull();
    expect(project?.colorIndex).toBe(0);
  });

  it("同一个项目第二次派活复用已有项目记录，不重复建档", async () => {
    await submitWorker(engine.ctx, { projectPath: cwd, cwd, prompt: "第一个" });
    await submitWorker(engine.ctx, { projectPath: cwd, cwd, prompt: "第二个" });
    expect(engine.repos.projects.list()).toHaveLength(1);
  });

  it("标题缺省时取正文第一个非空行压成一行，超过 40 字截断", async () => {
    const longLine = "x".repeat(60);
    const summary = await submitWorker(engine.ctx, {
      projectPath: cwd,
      cwd,
      prompt: `\n\n  ${longLine}  \n后面还有`,
    });
    expect(summary.title.length).toBeLessThanOrEqual(40);
    expect(summary.title.startsWith("x")).toBe(true);
  });

  it("显式传入的标题原样使用", async () => {
    const summary = await submitWorker(engine.ctx, {
      projectPath: cwd,
      cwd,
      prompt: "任务",
      title: "自定义标题",
    });
    expect(summary.title).toBe("自定义标题");
  });

  it("pi 苦工的 sessionRef 建档时就有；opencode 的建档时是 null", async () => {
    const pi = await submitWorker(engine.ctx, {
      projectPath: cwd,
      cwd,
      prompt: "任务",
      runtime: "pi",
    });
    const piWorker = engine.repos.workers.get(pi.id);
    expect(piWorker?.sessionRef).toBe(`fleet-${pi.id}`);

    const oc = await submitWorker(engine.ctx, {
      projectPath: cwd,
      cwd,
      prompt: "任务",
      runtime: "opencode",
    });
    const ocWorker = engine.repos.workers.get(oc.id);
    expect(ocWorker?.sessionRef).toBeNull();
  });

  it("建档后第 1 次运行状态是排队中，用量为零，事件计数为零", async () => {
    const summary = await submitWorker(engine.ctx, { projectPath: cwd, cwd, prompt: "任务" });
    expect(summary.status).toBe("queued");
    expect(summary.usage).toEqual(ZERO_USAGE);
    expect(summary.runSeq).toBe(1);
  });

  it("超时时长按池和单次覆盖计算", async () => {
    const summary = await submitWorker(engine.ctx, {
      projectPath: cwd,
      cwd,
      prompt: "任务",
      timeoutMin: 5,
    });
    const run = engine.repos.runs.get(`${summary.id}.1`);
    expect(run?.timeoutMs).toBe(5 * 60_000);
  });

  it("项目、苦工、运行在一个事务里写入：三张表都有对应记录", async () => {
    const summary = await submitWorker(engine.ctx, { projectPath: cwd, cwd, prompt: "任务" });
    expect(engine.repos.projects.get(summary.projectKey)).not.toBeNull();
    expect(engine.repos.workers.get(summary.id)).not.toBeNull();
    expect(engine.repos.runs.get(`${summary.id}.1`)).not.toBeNull();
  });

  it("建档之后时间线里出现 run_start，且发出了 worker/snapshot 事件", async () => {
    const events: string[] = [];
    engine.ctx.events.subscribe((event) => events.push(event.type));

    const summary = await submitWorker(engine.ctx, { projectPath: cwd, cwd, prompt: "任务" });

    const page = await engine.ctx.timelines.timeline(summary.id, -1, 10);
    expect(page?.events[0]).toMatchObject({ kind: "run_start" });
    expect(events).toContain("worker");
    expect(events).toContain("snapshot");
  });

  it("建档之后请求了一次放行：运行很快被占位成 running（假苦工可以正常启动）", async () => {
    const summary = await submitWorker(engine.ctx, { projectPath: cwd, cwd, prompt: "任务" });
    await waitFor(() => engine.repos.runs.get(`${summary.id}.1`)?.status === "running", {
      message: `运行 ${summary.id}.1 一直没有被放行`,
    });
  });
});

describe("sendToWorker：续接（模块设计 3.3）", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = await createTestEngine();
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("苦工不存在时抛 not_found", async () => {
    await expect(sendToWorker(engine.ctx, "wnoexist", { prompt: "继续" })).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("最新运行还在排队或工作中时抛 conflict", async () => {
    const worker = createWorkerRecord();
    const run = createRunRecord({ status: "running", startedAt: worker.createdAt });
    engine.repos.projects.insert({
      key: worker.projectKey,
      path: worker.cwd,
      name: "demo",
      colorIndex: 0,
      createdAt: worker.createdAt,
    });
    engine.repos.workers.insert(worker);
    engine.repos.runs.insert(run);

    await expect(sendToWorker(engine.ctx, worker.id, { prompt: "继续" })).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("opencode 且 sessionRef 为 null 时抛 conflict：会话还没建立", async () => {
    const worker = createWorkerRecord({ runtime: "opencode", sessionRef: null });
    const run = createRunRecord({ status: "completed", endedAt: worker.createdAt });
    engine.repos.projects.insert({
      key: worker.projectKey,
      path: worker.cwd,
      name: "demo",
      colorIndex: 0,
      createdAt: worker.createdAt,
    });
    engine.repos.workers.insert(worker);
    engine.repos.runs.insert(run);

    await expect(sendToWorker(engine.ctx, worker.id, { prompt: "继续" })).rejects.toMatchObject({
      code: "conflict",
      message: expect.stringContaining("会话"),
    });
  });

  it("续接沿用原池，成功后不改池归属", async () => {
    const worker = createWorkerRecord({ requestedPool: "dsf", poolId: "dsf" });
    const run = createRunRecord({ status: "completed", endedAt: worker.createdAt });
    engine.repos.projects.insert({
      key: worker.projectKey,
      path: worker.cwd,
      name: "demo",
      colorIndex: 0,
      createdAt: worker.createdAt,
    });
    engine.repos.workers.insert(worker);
    engine.repos.runs.insert(run);

    const summary = await sendToWorker(engine.ctx, worker.id, { prompt: "继续干" });

    expect(summary.poolId).toBe("dsf");
    expect(engine.repos.workers.get(worker.id)).toMatchObject({
      requestedPool: "dsf",
      poolId: "dsf",
    });
    expect(engine.repos.runs.get(`${worker.id}.2`)?.status).toBe("queued");
  });

  it("原池停用时续接抛 pool_disabled，不迁移到其他池", async () => {
    const worker = createWorkerRecord({ requestedPool: "dsf", poolId: "dsf" });
    const run = createRunRecord({ status: "completed", endedAt: worker.createdAt });
    const config = engine.config.current();
    engine.config.setConfig({
      ...config,
      pools: config.pools.map((pool) => ({ ...pool, enabled: false })),
    });
    engine.repos.projects.insert({
      key: worker.projectKey,
      path: worker.cwd,
      name: "demo",
      colorIndex: 0,
      createdAt: worker.createdAt,
    });
    engine.repos.workers.insert(worker);
    engine.repos.runs.insert(run);

    await expect(sendToWorker(engine.ctx, worker.id, { prompt: "继续干" })).rejects.toMatchObject({
      code: "pool_disabled",
    });
    expect(engine.repos.runs.get(`${worker.id}.2`)).toBeNull();
  });

  it("成功续接：新建第 2 次运行、latestRunSeq 更新为 2", async () => {
    const worker = createWorkerRecord();
    const run = createRunRecord({ status: "completed", endedAt: worker.createdAt });
    engine.repos.projects.insert({
      key: worker.projectKey,
      path: worker.cwd,
      name: "demo",
      colorIndex: 0,
      createdAt: worker.createdAt,
    });
    engine.repos.workers.insert(worker);
    engine.repos.runs.insert(run);

    const summary = await sendToWorker(engine.ctx, worker.id, { prompt: "继续干" });
    expect(summary.runSeq).toBe(2);
    expect(engine.repos.workers.get(worker.id)?.latestRunSeq).toBe(2);
    expect(engine.repos.runs.get(`${worker.id}.2`)?.prompt).toBe("继续干");
  });
});
