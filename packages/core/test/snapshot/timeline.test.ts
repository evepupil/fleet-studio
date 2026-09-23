import { describe, expect, it } from "vitest";
import type { TimelineDraft } from "../../src/domain/timeline.js";
import { assembleTimeline, type RunDrafts } from "../../src/snapshot/timeline.js";
import { makeRun } from "./fixtures.js";

function textDraft(at: string, text: string): TimelineDraft {
  return { kind: "text", at, text };
}

describe("assembleTimeline", () => {
  it("单次运行：run_start + 草稿 + run_end，seq 从 0 连续编号", () => {
    const run = makeRun({
      seq: 1,
      status: "completed",
      startedAt: "2026-09-23T00:01:00.000Z",
      endedAt: "2026-09-23T00:05:00.000Z",
      prompt: "把这件事做完",
    });
    const drafts = [
      textDraft("2026-09-23T00:02:00.000Z", "开始处理"),
      textDraft("2026-09-23T00:03:00.000Z", "处理中"),
    ];

    const events = assembleTimeline([{ run, drafts }]);

    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(events.every((e) => e.runSeq === 1)).toBe(true);
    expect(events[0]).toMatchObject({
      kind: "run_start",
      at: "2026-09-23T00:01:00.000Z",
      prompt: "把这件事做完",
    });
    expect(events[3]).toMatchObject({
      kind: "run_end",
      at: "2026-09-23T00:05:00.000Z",
      status: "completed",
    });
  });

  it("多次运行按 run.seq 升序拼接，即便传入顺序是乱的，seq 跨运行连续", () => {
    const run1 = makeRun({
      id: "w1.1",
      seq: 1,
      status: "completed",
      startedAt: "2026-09-23T00:01:00.000Z",
      endedAt: "2026-09-23T00:02:00.000Z",
    });
    const run2 = makeRun({
      id: "w1.2",
      seq: 2,
      status: "completed",
      startedAt: "2026-09-23T00:03:00.000Z",
      endedAt: "2026-09-23T00:04:00.000Z",
    });

    // 故意把 run2 放前面，验证内部会按 seq 重新排序而不是照抄输入顺序。
    const input: RunDrafts[] = [
      { run: run2, drafts: [] },
      { run: run1, drafts: [] },
    ];

    const events = assembleTimeline(input);

    expect(events.map((e) => e.runSeq)).toEqual([1, 1, 2, 2]);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(events.map((e) => e.kind)).toEqual(["run_start", "run_end", "run_start", "run_end"]);
  });

  it("非终态运行不补 run_end", () => {
    const run = makeRun({
      seq: 1,
      status: "running",
      startedAt: "2026-09-23T00:01:00.000Z",
      endedAt: null,
    });

    const events = assembleTimeline([
      { run, drafts: [textDraft("2026-09-23T00:02:00.000Z", "还在跑")] },
    ]);

    expect(events.map((e) => e.kind)).toEqual(["run_start", "text"]);
  });

  it("run_start 的时间：优先 startedAt，没有就用 queuedAt", () => {
    const started = makeRun({ seq: 1, status: "running", startedAt: "2026-09-23T00:01:00.000Z" });
    const notStartedYet = makeRun({
      seq: 1,
      status: "queued",
      startedAt: null,
      queuedAt: "2026-09-23T00:00:30.000Z",
    });

    expect(assembleTimeline([{ run: started, drafts: [] }])[0]).toMatchObject({
      at: "2026-09-23T00:01:00.000Z",
    });
    expect(assembleTimeline([{ run: notStartedYet, drafts: [] }])[0]).toMatchObject({
      at: "2026-09-23T00:00:30.000Z",
    });
  });

  it("run_end 时间兜底：endedAt 缺失时用最后一条草稿的时间", () => {
    const run = makeRun({
      seq: 1,
      status: "completed",
      startedAt: "2026-09-23T00:01:00.000Z",
      endedAt: null,
    });
    const drafts = [
      textDraft("2026-09-23T00:02:00.000Z", "第一条"),
      textDraft("2026-09-23T00:03:00.000Z", "最后一条"),
    ];

    const events = assembleTimeline([{ run, drafts }]);
    const runEnd = events.find((e) => e.kind === "run_end");

    expect(runEnd).toMatchObject({ at: "2026-09-23T00:03:00.000Z" });
  });

  it("run_end 时间兜底：没有草稿时用 startedAt，startedAt 也没有时用 queuedAt", () => {
    const withStartedAt = makeRun({
      seq: 1,
      status: "failed",
      failReason: "model_error",
      errorMessage: "通道超时",
      startedAt: "2026-09-23T00:01:00.000Z",
      endedAt: null,
    });
    const runEnd1 = assembleTimeline([{ run: withStartedAt, drafts: [] }]).find(
      (e) => e.kind === "run_end",
    );
    expect(runEnd1).toMatchObject({
      at: "2026-09-23T00:01:00.000Z",
      failReason: "model_error",
      message: "通道超时",
    });

    const withoutStartedAt = makeRun({
      seq: 1,
      status: "failed",
      failReason: "queue_timeout",
      startedAt: null,
      queuedAt: "2026-09-23T00:00:10.000Z",
      endedAt: null,
    });
    const runEnd2 = assembleTimeline([{ run: withoutStartedAt, drafts: [] }]).find(
      (e) => e.kind === "run_end",
    );
    expect(runEnd2).toMatchObject({ at: "2026-09-23T00:00:10.000Z" });
  });
});
