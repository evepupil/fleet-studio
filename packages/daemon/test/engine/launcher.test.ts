import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { launchRun } from "../../src/engine/launcher.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./support/records.js";
import { createTestEngine, type TestEngine } from "./support/testEngine.js";
import { waitFor } from "./support/waitFor.js";

/** 建好一个「已经被 dispatcher 占位」的运行 + 它的苦工 + 项目，直接喂给 launchRun。 */
async function seedRunningRun(
  engine: TestEngine,
  workerOverrides: Parameters<typeof createWorkerRecord>[0] = {},
) {
  const cwd = join(engine.home, "project");
  await mkdir(cwd, { recursive: true });
  const worker = createWorkerRecord({ cwd, ...workerOverrides });
  const run = createRunRecord({ status: "running", startedAt: "2026-01-01T00:00:01.000Z" });
  engine.repos.projects.insert(createProjectRecord({ key: worker.projectKey, path: cwd }));
  engine.repos.workers.insert(worker);
  engine.repos.runs.insert(run);
  return { worker, run };
}

describe("launchRun：把一次运行真正拉起来（模块设计 3.5）", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = await createTestEngine();
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("池已经不在配置里（防御性兜底）：失败 spawn_error，说明带池编号", async () => {
    const { worker, run } = await seedRunningRun(engine, { poolId: "no-such-pool" });
    await launchRun(engine.ctx, run, worker);
    const updated = engine.repos.runs.get(run.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.failReason).toBe("spawn_error");
    expect(updated?.errorMessage).toContain("no-such-pool");
  });

  it("角色已经不在配置里：记一条警告日志，仍然用空角色继续启动", async () => {
    const { worker, run } = await seedRunningRun(engine, { role: "no-such-role" });
    await launchRun(engine.ctx, run, worker);
    expect(
      engine.logger.records.some((r) => r.level === "warn" && r.message.includes("no-such-role")),
    ).toBe(true);
    const updated = engine.repos.runs.get(run.id);
    expect(updated?.status).toBe("running");
    expect(updated?.pid).not.toBeNull();
  });

  it("opencode 角色的提示词文件读不到：失败 spawn_error，说明带路径", async () => {
    const config = engine.config.current();
    engine.config.setConfig({
      ...config,
      roles: [
        ...config.roles.filter((role) => role.id !== "worker"),
        {
          id: "worker",
          label: "实现",
          description: "",
          pi: {},
          opencode: { promptFile: join(engine.home, "missing-prompt.md") },
        },
      ],
    });
    const { worker, run } = await seedRunningRun(engine, {
      runtime: "opencode",
      sessionRef: "ses_abc",
    });
    await launchRun(engine.ctx, run, worker);
    const updated = engine.repos.runs.get(run.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.failReason).toBe("spawn_error");
    expect(updated?.errorMessage).toContain("missing-prompt.md");
  });

  it("找不到可执行文件（host.resolve 抛错）：失败 spawn_error，说明取自错误消息", async () => {
    engine.host.failNextResolve(new Error("找不到 pi：试过 a、b"));
    const { worker, run } = await seedRunningRun(engine);
    await launchRun(engine.ctx, run, worker);
    const updated = engine.repos.runs.get(run.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.failReason).toBe("spawn_error");
    expect(updated?.errorMessage).toBe("找不到 pi：试过 a、b");
  });

  it("启动失败（host.spawn 抛错）：失败 spawn_error", async () => {
    engine.host.failNextSpawn(new Error("启动失败：路径不对"));
    const { worker, run } = await seedRunningRun(engine);
    await launchRun(engine.ctx, run, worker);
    const updated = engine.repos.runs.get(run.id);
    expect(updated?.status).toBe("failed");
    expect(updated?.failReason).toBe("spawn_error");
  });

  it("成功启动：写 pid/processImage，登记跟踪器，发 worker 事件", async () => {
    const { worker, run } = await seedRunningRun(engine);
    let sawWorkerEvent = false;
    engine.ctx.events.subscribe((event) => {
      if (event.type === "worker" && event.workerId === worker.id) {
        sawWorkerEvent = true;
      }
    });

    await launchRun(engine.ctx, run, worker);

    const updated = engine.repos.runs.get(run.id);
    expect(updated?.pid).not.toBeNull();
    expect(updated?.processImage).not.toBeNull();
    expect(engine.ctx.trackers.has(run.id)).toBe(true);
    expect(sawWorkerEvent).toBe(true);
  });

  it("长任务写文件：适配器要求走文件时，files 里的内容真的落盘到 runDir", async () => {
    const { worker, run } = await seedRunningRun(engine);
    // 用一个超过 ARGV_PROMPT_MAX_CHARS（pi 是 24000）的超长任务正文触发「写文件」分支。
    const longPrompt = "写代码。".repeat(10_000);
    const longRun = { ...run, prompt: longPrompt };

    await launchRun(engine.ctx, longRun, worker);

    const updated = engine.repos.runs.get(run.id);
    expect(updated?.status).toBe("running");
    const taskFile = join(engine.ctx.deps.paths.runDir(run.id), "task.md");
    const content = await readFile(taskFile, "utf8");
    expect(content).toBe(longPrompt);
  });

  it("启动期间被取消：拿到进程号后立刻结束新起的进程", async () => {
    const { worker, run } = await seedRunningRun(engine);
    // 模拟 cancel() 已经先一步写了 killedBy=cancel（这时候还没拿到 pid）。
    engine.repos.runs.update(run.id, { killedBy: "cancel" });

    await launchRun(engine.ctx, run, worker);

    const updated = engine.repos.runs.get(run.id);
    expect(updated?.pid).not.toBeNull();
    const pid = updated?.pid ?? null;
    expect(pid).not.toBeNull();
    if (pid !== null) {
      await waitFor(() => engine.host.killedPids.includes(pid));
    }
  });
});
