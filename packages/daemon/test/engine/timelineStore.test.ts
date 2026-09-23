import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEventBus } from "../../src/engine/events.js";
import { submitWorker } from "../../src/engine/submit.js";
import { createTimelineStore } from "../../src/engine/timelineStore.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./support/records.js";
import { piAssistantTextLine } from "./support/runtimeLines.js";
import { createTestEngine, type TestEngine } from "./support/testEngine.js";
import { waitFor } from "./support/waitFor.js";

async function runToCompletion(engine: TestEngine, text: string): Promise<string> {
  const cwd = join(engine.home, "project");
  await mkdir(cwd, { recursive: true });
  const summary = await submitWorker(engine.ctx, { projectPath: cwd, cwd, prompt: "任务" });
  const runId = `${summary.id}.1`;
  // 状态变成 running 和跟踪器注册完成不是同一时刻（launcher 中间还有几个 await）：
  // 要等的是跟踪器真的登记好了，不能只看状态。
  await waitFor(() => engine.ctx.trackers.has(runId));

  const tracker = engine.ctx.trackers.get(runId);
  if (tracker === undefined) {
    throw new Error("跟踪器没有注册成功");
  }
  const outFile = engine.ctx.deps.paths.outFile(runId);
  await appendFile(outFile, `${piAssistantTextLine(text)}\n`, "utf8");
  await tracker.handleExit({ code: 0, signal: null });
  await waitFor(() => engine.repos.runs.get(runId)?.status === "completed");
  return summary.id;
}

describe("timelineStore：时间线缓存与增量通知（模块设计 3.10）", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = await createTestEngine();
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("苦工不存在时 timeline() 返回 null", async () => {
    const page = await engine.ctx.timelines.timeline("wnoexist", -1, 10);
    expect(page).toBeNull();
  });

  it("appendDrafts 之后 refresh：比缓存多出的尾部事件通过事件总线发出", async () => {
    const worker = createWorkerRecord();
    const run = createRunRecord({ status: "running", startedAt: "2026-01-01T00:00:01.000Z" });
    engine.repos.projects.insert(createProjectRecord({ key: worker.projectKey, path: worker.cwd }));
    engine.repos.workers.insert(worker);
    engine.repos.runs.insert(run);

    // 先 refresh 一次，缓存里只有 run_start（运行还没结束，不会有 run_end）。
    await engine.ctx.timelines.refresh(worker.id);

    const deltas: string[] = [];
    engine.ctx.events.subscribe((event) => {
      if (event.type === "timeline" && event.workerId === worker.id) {
        deltas.push(...event.events.map((e) => e.kind));
      }
    });

    engine.ctx.timelines.appendDrafts(worker.id, run.id, [
      { kind: "text", at: "2026-01-01T00:00:02.000Z", text: "第一段" },
    ]);
    await engine.ctx.timelines.refresh(worker.id);

    expect(deltas).toEqual(["text"]);

    // 再 refresh 一次但没有新草稿：不应该重复发出同样的事件。
    await engine.ctx.timelines.refresh(worker.id);
    expect(deltas).toEqual(["text"]);
  });

  it("timeline(after, limit) 按 seq 分页：after 之后最多 limit 条，next 指向最后一条", async () => {
    const workerId = await runToCompletion(engine, "完成了");
    const full = await engine.ctx.timelines.timeline(workerId, -1, 1000);
    expect(full).not.toBeNull();
    const total = full?.total ?? 0;
    expect(total).toBeGreaterThan(1); // 至少有 run_start、text、run_end

    const firstPage = await engine.ctx.timelines.timeline(workerId, -1, 1);
    expect(firstPage?.events).toHaveLength(1);
    expect(firstPage?.events[0]?.kind).toBe("run_start");
    expect(firstPage?.next).toBe(0);
    expect(firstPage?.total).toBe(total);

    const secondPage = await engine.ctx.timelines.timeline(workerId, firstPage?.next ?? -1, 1000);
    expect(secondPage?.events).toHaveLength(total - 1);
  });

  it("时间线在结尾包含 run_start 和 run_end，中间是解析出的事件", async () => {
    const workerId = await runToCompletion(engine, "结论文字");
    const page = await engine.ctx.timelines.timeline(workerId, -1, 1000);
    const kinds = page?.events.map((event) => event.kind) ?? [];
    expect(kinds[0]).toBe("run_start");
    expect(kinds.at(-1)).toBe("run_end");
    expect(kinds).toContain("text");
  });

  it("重新加载一致：全新的 timelineStore 实例（模拟服务重启）从磁盘重建出同样的时间线", async () => {
    const workerId = await runToCompletion(engine, "落盘的结论");
    const originalPage = await engine.ctx.timelines.timeline(workerId, -1, 1000);

    const freshStore = createTimelineStore({
      repos: engine.repos,
      paths: engine.ctx.deps.paths,
      logger: engine.logger,
      events: createEventBus(engine.logger),
    });
    const reloadedPage = await freshStore.timeline(workerId, -1, 1000);

    expect(reloadedPage?.events).toEqual(originalPage?.events);
    expect(reloadedPage?.total).toBe(originalPage?.total);
  });

  it("F6a 回归：forget() 清掉缓存，之后重新计算而不是继续沿用旧缓存", async () => {
    const workerId = await runToCompletion(engine, "旧结论");
    const before = await engine.ctx.timelines.timeline(workerId, -1, 1000);
    expect(before?.events.some((event) => event.kind === "text")).toBe(true);

    // 直接改写磁盘上的 timeline.jsonl，模拟底层数据变了；如果 forget() 没有真的清掉缓存，
    // 下面再查一次还是会拿到旧内容，因为已经结束的运行会优先命中缓存。
    const runId = `${workerId}.1`;
    await writeFile(
      engine.ctx.deps.paths.timelineFile(runId),
      `${JSON.stringify({ kind: "text", at: "2026-01-01T00:00:02.000Z", text: "新结论占位" })}\n`,
      "utf8",
    );

    engine.ctx.timelines.forget(workerId);
    const after = await engine.ctx.timelines.timeline(workerId, -1, 1000);

    const texts = (after?.events ?? [])
      .filter((event) => event.kind === "text")
      .map((event) => (event.kind === "text" ? event.text : ""));
    expect(texts).toEqual(["新结论占位"]);
  });
});
