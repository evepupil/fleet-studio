import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { getRuntimeAdapter, PI_MAX_CONSECUTIVE_FAILURES, type RuntimeId } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRunTracker } from "../../src/engine/runTracker.js";
import { createOutputTailer } from "../../src/process/outputTailer.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./support/records.js";
import {
  opencodeStepFinishLine,
  opencodeStepStartLine,
  opencodeTextLine,
  piAssistantTextLine,
  piErrorLine,
} from "./support/runtimeLines.js";
import { createTestEngine, type TestEngine } from "./support/testEngine.js";

interface TrackerSetup {
  outFile: string;
  errFile: string;
  pid: number;
  workerId: string;
  runId: string;
}

async function setupTracker(
  engine: TestEngine,
  options: {
    runtime?: RuntimeId;
    isAdopted?: boolean;
    sessionRefKnown?: boolean;
    workerOverrides?: Parameters<typeof createWorkerRecord>[0];
  } = {},
): Promise<TrackerSetup> {
  const runtime = options.runtime ?? "pi";
  const worker = createWorkerRecord({
    runtime,
    sessionRef: runtime === "pi" ? "fleet-wabcde" : null,
    ...options.workerOverrides,
  });
  const run = createRunRecord({ status: "running", startedAt: "2026-01-01T00:00:01.000Z" });
  engine.repos.projects.insert(createProjectRecord({ key: worker.projectKey, path: worker.cwd }));
  engine.repos.workers.insert(worker);
  engine.repos.runs.insert(run);

  const runDir = engine.ctx.deps.paths.runDir(run.id);
  await mkdir(runDir, { recursive: true });
  const outFile = engine.ctx.deps.paths.outFile(run.id);
  const errFile = engine.ctx.deps.paths.errFile(run.id);
  await writeFile(outFile, "", "utf8");
  await writeFile(errFile, "", "utf8");

  const pid = 9001;
  engine.host.registerExistingProcess(pid, true);

  const tracker = createRunTracker(engine.ctx, {
    runId: run.id,
    workerId: worker.id,
    pid,
    processImage: "fake-runtime.exe",
    reducer: getRuntimeAdapter(runtime).createReducer(),
    stdoutTailer: createOutputTailer(outFile, 0),
    stderrTailer: createOutputTailer(errFile, 0),
    isAdopted: options.isAdopted ?? false,
    sessionRefKnown: options.sessionRefKnown ?? worker.sessionRef !== null,
  });
  engine.ctx.trackers.set(run.id, tracker);
  return { outFile, errFile, pid, workerId: worker.id, runId: run.id };
}

describe("runTracker：跟踪一次运行（模块设计 3.6）", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = await createTestEngine();
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("读到新行后落库：usage、activity、finalText、eventCount 都反映最新进展", async () => {
    const setup = await setupTracker(engine);
    await appendFile(setup.outFile, `${piAssistantTextLine("第一段")}\n`, "utf8");

    const tracker = engine.ctx.trackers.get(setup.runId);
    if (tracker === undefined) {
      throw new Error("跟踪器没有注册成功");
    }
    await tracker.poll(engine.ctx.now());

    const run = engine.repos.runs.get(setup.runId);
    expect(run?.finalText).toBe("第一段");
    expect(run?.eventCount).toBeGreaterThan(0);
  });

  it("阶段/重试/暂定结局不变的进展变化，同一运行每秒最多落库一次；节流窗口过后自动补上", async () => {
    const setup = await setupTracker(engine);
    const tracker = engine.ctx.trackers.get(setup.runId);
    if (tracker === undefined) {
      throw new Error("跟踪器没有注册成功");
    }

    // 第一条消息让阶段从 starting 变成 working——阶段变化，立即落库。
    await appendFile(setup.outFile, `${piAssistantTextLine("第一段")}\n`, "utf8");
    await tracker.poll(engine.ctx.now());
    expect(engine.repos.runs.get(setup.runId)?.finalText).toBe("第一段");

    // 第二条消息只是文字和用量变化，阶段/重试/暂定结局都没变——1 秒内不应该落库。
    engine.advanceNow(200);
    await appendFile(setup.outFile, `${piAssistantTextLine("第二段")}\n`, "utf8");
    await tracker.poll(engine.ctx.now());
    expect(engine.repos.runs.get(setup.runId)?.finalText).toBe("第一段");

    // 过了 1 秒的节流窗口，下一次轮询（哪怕没有新行）应该把攒着的变化补上。
    engine.advanceNow(900);
    await tracker.poll(engine.ctx.now());
    expect(engine.repos.runs.get(setup.runId)?.finalText).toBe("第二段");
  });

  it("opencode：sessionRef 第一次出现时立刻写回苦工记录", async () => {
    const setup = await setupTracker(engine, { runtime: "opencode", sessionRefKnown: false });
    const sessionId = "ses_test123";
    await appendFile(
      setup.outFile,
      `${opencodeStepStartLine(sessionId)}\n${opencodeTextLine(sessionId, "收到")}\n${opencodeStepFinishLine(sessionId)}\n`,
      "utf8",
    );
    const tracker = engine.ctx.trackers.get(setup.runId);
    if (tracker === undefined) {
      throw new Error("跟踪器没有注册成功");
    }
    await tracker.poll(engine.ctx.now());
    expect(engine.repos.workers.get(setup.workerId)?.sessionRef).toBe(sessionId);
  });

  it("pi 连续失败达到上限进入 ended：10 秒内不结束进程，超过 10 秒后结束它", async () => {
    const setup = await setupTracker(engine);
    const lines = Array.from({ length: PI_MAX_CONSECUTIVE_FAILURES }, () =>
      piErrorLine("通道错误"),
    ).join("\n");
    await appendFile(setup.outFile, `${lines}\n`, "utf8");

    const tracker = engine.ctx.trackers.get(setup.runId);
    if (tracker === undefined) {
      throw new Error("跟踪器没有注册成功");
    }

    await tracker.poll(engine.ctx.now()); // 第一次观察到 ended：记下时间，不结束
    expect(engine.host.killedPids).not.toContain(setup.pid);

    engine.advanceNow(9_999);
    await tracker.poll(engine.ctx.now());
    expect(engine.host.killedPids).not.toContain(setup.pid);

    engine.advanceNow(1);
    await tracker.poll(engine.ctx.now());
    expect(engine.host.killedPids).toContain(setup.pid);
  });

  it("接管的运行（isAdopted）：定期探测存活，发现已经不在了就自己收尾为 lost", async () => {
    const setup = await setupTracker(engine, { isAdopted: true });
    const tracker = engine.ctx.trackers.get(setup.runId);
    if (tracker === undefined) {
      throw new Error("跟踪器没有注册成功");
    }

    // 头一次轮询：进程还活着，正常继续跟踪。
    let done = await tracker.poll(engine.ctx.now());
    expect(done).toBe(false);
    expect(engine.repos.runs.get(setup.runId)?.status).toBe("running");

    // 进程消失了（轮询存活发现的，不是通过 onExit）。
    engine.host.setAlive(setup.pid, false);
    engine.advanceNow(2_100);
    done = await tracker.poll(engine.ctx.now());

    expect(done).toBe(true);
    const run = engine.repos.runs.get(setup.runId);
    expect(run?.status).toBe("failed");
    expect(run?.failReason).toBe("interrupted");
  });

  it("handleExit：进程正常退出（退出码 0）且有模型输出，读完剩余输出后收尾为已完成", async () => {
    const setup = await setupTracker(engine);
    const tracker = engine.ctx.trackers.get(setup.runId);
    if (tracker === undefined) {
      throw new Error("跟踪器没有注册成功");
    }
    await appendFile(setup.outFile, `${piAssistantTextLine("干完了")}`, "utf8"); // 故意不带换行，模拟尾部半行

    await tracker.handleExit({ code: 0, signal: null });

    const run = engine.repos.runs.get(setup.runId);
    expect(run?.status).toBe("completed");
    expect(run?.finalText).toBe("干完了");
  });
});
