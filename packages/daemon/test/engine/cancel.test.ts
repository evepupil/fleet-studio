import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { FleetError } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cancelWorker } from "../../src/engine/cancel.js";
import { submitWorker } from "../../src/engine/submit.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./support/records.js";
import { createTestEngine, type TestEngine } from "./support/testEngine.js";
import { waitFor } from "./support/waitFor.js";

/** 建好一个苦工 + 一次运行，跳过 submit 的路径校验，直接摆好想测的状态。 */
function seedWorkerWithRun(
  engine: TestEngine,
  runOverrides: Parameters<typeof createRunRecord>[0] = {},
) {
  const worker = createWorkerRecord();
  const run = createRunRecord(runOverrides);
  engine.repos.projects.insert(createProjectRecord({ key: worker.projectKey, path: worker.cwd }));
  engine.repos.workers.insert(worker);
  engine.repos.runs.insert(run);
  return { worker, run };
}

describe("cancelWorker：取消（模块设计 3.9）", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = await createTestEngine();
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("苦工不存在时抛 not_found", async () => {
    await expect(cancelWorker(engine.ctx, "wnoexist")).rejects.toBeInstanceOf(FleetError);
  });

  it("排队中的苦工：直接收尾为已取消，说明「已被取消」", async () => {
    const { worker } = seedWorkerWithRun(engine, { status: "queued" });
    const summary = await cancelWorker(engine.ctx, worker.id);
    expect(summary.status).toBe("cancelled");
    expect(summary.errorMessage).toBe("已被取消");
    const run = engine.repos.runs.get(`${worker.id}.1`);
    expect(run?.endedAt).not.toBeNull();
  });

  it("工作中且进程号已知：写 killedBy=cancel 并立刻结束进程", async () => {
    const pid = 4242;
    engine.host.registerExistingProcess(pid, true);
    const { worker } = seedWorkerWithRun(engine, {
      status: "running",
      startedAt: "2026-01-01T00:00:01.000Z",
      pid,
      processImage: "fake-runtime.exe",
    });

    // 这里手工摆的运行没有真正的 launcher/runTracker 在盯着它，进程「退出」了也没人负责收尾，
    // 所以状态最终还是 running（等到 5 秒等待窗口过期）；killedBy 和结束进程这两件事本身
    // 已经在 cancel() 返回之前就同步完成，不需要等 5 秒也能断言。
    const summaryPromise = cancelWorker(engine.ctx, worker.id);
    await waitFor(() => engine.host.killedPids.includes(pid));
    expect(engine.repos.runs.get(`${worker.id}.1`)?.killedBy).toBe("cancel");
    await summaryPromise;
  });

  it("工作中但进程号还没拿到：只写标记，不报错也不结束什么进程", async () => {
    const { worker } = seedWorkerWithRun(engine, {
      status: "running",
      startedAt: "2026-01-01T00:00:01.000Z",
    });
    const summary = await cancelWorker(engine.ctx, worker.id);
    expect(engine.host.killedPids).toHaveLength(0);
    // 5 秒内进程也不会自己退出，所以这里仍然是 running——摘要如实反映当前情况，不是报错。
    expect(summary.status).toBe("running");
  });

  it("F3 回归：killedBy 已经被超时检查抢先写过，取消不会覆盖成 cancel", async () => {
    const pid = 5151;
    engine.host.registerExistingProcess(pid, true);
    const { worker } = seedWorkerWithRun(engine, {
      status: "running",
      startedAt: "2026-01-01T00:00:01.000Z",
      pid,
      processImage: "fake-runtime.exe",
      killedBy: "timeout",
    });

    await cancelWorker(engine.ctx, worker.id);

    // killedBy 谁先写谁算：这里超时检查已经先标记过了，取消不能改写成 cancel。
    expect(engine.repos.runs.get(`${worker.id}.1`)?.killedBy).toBe("timeout");
    // 即便没抢到 killedBy，取消仍然要真的去结束进程（进程终究要被杀掉）。
    expect(engine.host.killedPids).toContain(pid);
  });

  it("已经是终态的苦工：原样返回，不报错、不改变状态", async () => {
    const { worker } = seedWorkerWithRun(engine, {
      status: "completed",
      endedAt: "2026-01-01T00:00:05.000Z",
    });
    const before = engine.repos.runs.get(`${worker.id}.1`);
    const summary = await cancelWorker(engine.ctx, worker.id);
    expect(summary.status).toBe("completed");
    expect(engine.repos.runs.get(`${worker.id}.1`)).toEqual(before);
  });

  it("取消排队中的苦工后，快照会反映出苦工数量的变化（发过 snapshot 事件）", async () => {
    const { worker } = seedWorkerWithRun(engine, { status: "queued" });
    let sawSnapshotEvent = false;
    engine.ctx.events.subscribe((event) => {
      if (event.type === "snapshot") {
        sawSnapshotEvent = true;
      }
    });
    await cancelWorker(engine.ctx, worker.id);
    expect(sawSnapshotEvent).toBe(true);
  });

  it("走完整的派活→放行→取消：真的有 runTracker 在跟踪，取消后 5 秒内收尾成已取消", async () => {
    const cwd = join(engine.home, "project");
    await mkdir(cwd, { recursive: true });
    const summary = await submitWorker(engine.ctx, { projectPath: cwd, cwd, prompt: "干活" });
    await waitFor(() => engine.repos.runs.get(`${summary.id}.1`)?.status === "running");

    const result = await cancelWorker(engine.ctx, summary.id);

    // 假进程托管默认 kill 就立刻触发 onExit，跟踪器会在收到退出回调后马上收尾。
    expect(result.status).toBe("cancelled");
    expect(result.errorMessage).toBe("已被取消");
  });
});
