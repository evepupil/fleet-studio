/**
 * 规格第 5 节第 11 条：快照。排队中的苦工要带上排队位置（从 1 开始、按排队先后）；
 * 全局 SSE（GET /api/stream）连上收到的第一条事件必须是 snapshot。
 */
import { API_PATHS, type WorkerSummary } from "@fleet/core";
import { scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSnapshot, submitWorker } from "./support/api.js";
import { type Harness, startHarness } from "./support/harness.js";
import { waitFor } from "./support/poll.js";
import { requireDefined } from "./support/require.js";
import { readFirstSseEvent } from "./support/sseClient.js";
import { waitForTraceStarts } from "./support/trace.js";

describe("快照：排队位置与全局 SSE 首条事件（规格第 11 条）", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness({ capacity: 1 });
  });

  afterEach(async () => {
    await harness.stop();
  });

  it("排队中的苦工带排队位置，从 1 开始按排队先后；在跑的苦工没有排队位置", async () => {
    const running = await submitWorker(harness, {
      projectPath: harness.projectDir,
      prompt: scenarioPrompt("hang"),
    });
    const runningId: string = running.id;
    await waitFor(async () => {
      const snapshot = await getSnapshot(harness);
      const entry = snapshot.workers.find((w: WorkerSummary) => w.id === runningId);
      return entry !== undefined && entry.status === "running";
    });

    const queuedIds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const worker = await submitWorker(harness, {
        projectPath: harness.projectDir,
        prompt: scenarioPrompt("hang"),
      });
      queuedIds.push(worker.id);
    }

    const snapshot = await getSnapshot(harness);
    for (let i = 0; i < 3; i += 1) {
      const id = requireDefined(queuedIds[i], `应该提交了第 ${i + 1} 个排队苦工`);
      const entry = snapshot.workers.find((w: WorkerSummary) => w.id === id);
      expect(entry.status).toBe("queued");
      expect(entry.queuePosition).toBe(i + 1);
    }

    const runningEntry = snapshot.workers.find((w: WorkerSummary) => w.id === runningId);
    expect(runningEntry.status).toBe("running");
    expect(runningEntry.queuePosition).toBeNull();

    // 「running」是放行循环占位时立刻写的，真正的进程要晚一步才拉起来（模块设计 3.4）；
    // 等轨迹文件确认这个进程已经启动过，afterEach 才能按轨迹找到它并结束掉。
    await waitForTraceStarts(harness.traceFile, 1);
  }, 25000);

  it("GET /api/stream 收到的第一条事件是 snapshot", async () => {
    const first = await readFirstSseEvent(harness, API_PATHS.stream);
    expect(first.event).toBe("snapshot");

    const data = JSON.parse(first.data);
    expect(typeof data.version).toBe("string");
    expect(Array.isArray(data.pools)).toBe(true);
  });
});
