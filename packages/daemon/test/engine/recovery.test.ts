import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runRecovery } from "../../src/engine/recovery.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./support/records.js";
import { piAgentSettledLine, piAssistantTextLine } from "./support/runtimeLines.js";
import { createTestEngine, type TestEngine } from "./support/testEngine.js";

async function seedRunningWorker(
  engine: TestEngine,
  overrides: Parameters<typeof createRunRecord>[0],
  preExistingOutput?: string,
) {
  const worker = createWorkerRecord();
  const run = createRunRecord({
    status: "running",
    startedAt: "2026-01-01T00:00:01.000Z",
    ...overrides,
  });
  engine.repos.projects.insert(createProjectRecord({ key: worker.projectKey, path: worker.cwd }));
  engine.repos.workers.insert(worker);
  engine.repos.runs.insert(run);

  const runDir = engine.ctx.deps.paths.runDir(run.id);
  await mkdir(runDir, { recursive: true });
  await writeFile(engine.ctx.deps.paths.outFile(run.id), preExistingOutput ?? "", "utf8");
  await writeFile(engine.ctx.deps.paths.errFile(run.id), "", "utf8");
  return { worker, run };
}

describe("recovery：服务启动时接管（模块设计 3.14）", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = await createTestEngine();
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("没有进程号：上次服务启动到一半就退出了，判失败 interrupted", async () => {
    const { run } = await seedRunningWorker(engine, { pid: null });
    await runRecovery(engine.ctx);
    const updated = engine.repos.runs.get(run.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.failReason).toBe("interrupted");
  });

  it("进程还活着：接管继续跟踪，重写的 timeline.jsonl 里已经有重启前的内容", async () => {
    const pid = 7001;
    engine.host.registerExistingProcess(pid, true);
    const preExisting = `${piAssistantTextLine("重启前说的话")}\n`;
    const { worker, run } = await seedRunningWorker(
      engine,
      { pid, processImage: "fake-runtime.exe" },
      preExisting,
    );

    await runRecovery(engine.ctx);

    expect(engine.ctx.trackers.has(run.id)).toBe(true);
    const page = await engine.ctx.timelines.timeline(worker.id, -1, 100);
    expect(page?.events.some((event) => event.kind === "text")).toBe(true);
    expect(engine.repos.runs.get(run.id)?.status).toBe("running"); // 还没结束，继续跟踪

    // 继续跟踪：重启后新产生的输出也应该被同一个跟踪器读到（用同一批 tailer，不会重复消费历史内容）。
    const tracker = engine.ctx.trackers.get(run.id);
    if (tracker === undefined) {
      throw new Error("接管后应该registered 一个跟踪器");
    }
    await appendFile(
      engine.ctx.deps.paths.outFile(run.id),
      `${piAssistantTextLine("重启后继续说")}\n`,
      "utf8",
    );
    await tracker.poll(engine.ctx.now());
    expect(engine.repos.runs.get(run.id)?.finalText).toBe("重启后继续说");
  });

  it("进程已经不在了，但输出里已经正常收尾：按输出判定为已完成，不是 interrupted", async () => {
    const pid = 7002;
    engine.host.registerExistingProcess(pid, false); // 已经不在了
    const preExisting = `${piAssistantTextLine("干完收工")}\n${piAgentSettledLine()}\n`;
    const { run } = await seedRunningWorker(
      engine,
      { pid, processImage: "fake-runtime.exe" },
      preExisting,
    );

    await runRecovery(engine.ctx);

    const updated = engine.repos.runs.get(run.id);
    expect(updated?.status).toBe("completed");
    expect(updated?.finalText).toBe("干完收工");
  });

  it("进程已经不在了，输出里也没有正常收尾：判失败 interrupted", async () => {
    const pid = 7003;
    engine.host.registerExistingProcess(pid, false);
    const { run } = await seedRunningWorker(engine, { pid, processImage: "fake-runtime.exe" }, "");

    await runRecovery(engine.ctx);

    const updated = engine.repos.runs.get(run.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.failReason).toBe("interrupted");
  });

  it("排队中的运行不受影响，正常留着参与放行", async () => {
    const worker = createWorkerRecord({ id: "wqueue1" });
    const run = createRunRecord({ id: "wqueue1.1", workerId: "wqueue1", status: "queued" });
    engine.repos.projects.insert(createProjectRecord({ key: worker.projectKey, path: worker.cwd }));
    engine.repos.workers.insert(worker);
    engine.repos.runs.insert(run);

    await runRecovery(engine.ctx);

    expect(engine.repos.runs.get(run.id)?.status).toBe("queued");
  });

  it("同时有多个工作中的运行：逐个接管，互不影响", async () => {
    const worker1 = createWorkerRecord({ id: "wmulti01" });
    const run1 = createRunRecord({
      id: "wmulti01.1",
      workerId: "wmulti01",
      status: "running",
      startedAt: "2026-01-01T00:00:01.000Z",
      pid: null,
    });
    engine.repos.projects.insert(
      createProjectRecord({ key: worker1.projectKey, path: worker1.cwd }),
    );
    engine.repos.workers.insert(worker1);
    engine.repos.runs.insert(run1);

    const pid2 = 7009;
    engine.host.registerExistingProcess(pid2, true);
    const worker2 = createWorkerRecord({ id: "wmulti02" });
    const run2 = createRunRecord({
      id: "wmulti02.1",
      workerId: "wmulti02",
      status: "running",
      startedAt: "2026-01-01T00:00:01.000Z",
      pid: pid2,
      processImage: "fake-runtime.exe",
    });
    // worker1 已经用同一个默认项目路径建过项目记录了，这里不用再插一次。
    engine.repos.workers.insert(worker2);
    engine.repos.runs.insert(run2);
    const runDir2 = engine.ctx.deps.paths.runDir(run2.id);
    await mkdir(runDir2, { recursive: true });
    await writeFile(engine.ctx.deps.paths.outFile(run2.id), "", "utf8");
    await writeFile(engine.ctx.deps.paths.errFile(run2.id), "", "utf8");

    await runRecovery(engine.ctx);

    expect(engine.repos.runs.get(run1.id)?.status).toBe("failed");
    expect(engine.repos.runs.get(run1.id)?.failReason).toBe("interrupted");
    expect(engine.repos.runs.get(run2.id)?.status).toBe("running");
    expect(engine.ctx.trackers.has(run2.id)).toBe(true);
  });
});
