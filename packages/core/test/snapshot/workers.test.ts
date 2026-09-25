import { describe, expect, it } from "vitest";
import { buildRunView, buildWorkerDetail, buildWorkerSummary } from "../../src/snapshot/workers.js";
import { baseConfig, makeProject, makeRun, makeUsage, makeWorker } from "./fixtures.js";

/** 摘要测试里统一的"现在"：runMs 的兜底计算要拿它当终点。 */
const NOW_MS = Date.parse("2026-09-23T10:00:00.000Z");

describe("buildWorkerSummary", () => {
  it("按 latestRunSeq 精确匹配最新运行，即便存在序号更大的运行", () => {
    const worker = makeWorker({ latestRunSeq: 2 });
    const runs = [
      makeRun({ id: "w00001.1", seq: 1, status: "completed" }),
      makeRun({ id: "w00001.2", seq: 2, status: "running" }),
      makeRun({ id: "w00001.3", seq: 3, status: "queued" }),
    ];

    const summary = buildWorkerSummary(worker, runs, baseConfig(), new Map(), NOW_MS);

    expect(summary.status).toBe("running");
    expect(summary.runSeq).toBe(2);
  });

  it("找不到 latestRunSeq 匹配的运行时，退回取 seq 最大的一条", () => {
    const worker = makeWorker({ latestRunSeq: 99 });
    const runs = [
      makeRun({ id: "w00001.1", seq: 1, status: "completed" }),
      makeRun({ id: "w00001.3", seq: 3, status: "failed", failReason: "model_error" }),
    ];

    const summary = buildWorkerSummary(worker, runs, baseConfig(), new Map(), NOW_MS);

    expect(summary.status).toBe("failed");
    expect(summary.runSeq).toBe(3);
    expect(summary.failReason).toBe("model_error");
  });

  it("一次运行都没有时按排队中处理，时间字段取 worker.createdAt", () => {
    const worker = makeWorker({ createdAt: "2026-09-23T05:00:00.000Z", latestRunSeq: 1 });

    const summary = buildWorkerSummary(worker, [], baseConfig(), new Map(), NOW_MS);

    expect(summary.status).toBe("queued");
    expect(summary.queuedAt).toBe("2026-09-23T05:00:00.000Z");
    expect(summary.startedAt).toBeNull();
    expect(summary.endedAt).toBeNull();
    expect(summary.runSeq).toBe(1);
    expect(summary.queuePosition).toBeNull();
    expect(summary.usage).toEqual(makeUsage());
    expect(summary.runMs).toBe(0);
  });

  it("用量按全部运行累加，费用只要有一方已知就按已知的加", () => {
    const worker = makeWorker({ latestRunSeq: 2 });
    const runs = [
      makeRun({
        id: "w00001.1",
        seq: 1,
        status: "completed",
        usage: makeUsage({ inputTokens: 100, outputTokens: 50, totalTokens: 150, costUsd: 1.5 }),
      }),
      makeRun({
        id: "w00001.2",
        seq: 2,
        status: "running",
        usage: makeUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: null }),
      }),
    ];

    const summary = buildWorkerSummary(worker, runs, baseConfig(), new Map(), NOW_MS);

    expect(summary.usage).toEqual(
      makeUsage({ inputTokens: 110, outputTokens: 55, totalTokens: 165, costUsd: 1.5 }),
    );
  });

  it("角色名取配置里的 label，找不到角色时退回角色编号本身", () => {
    const config = baseConfig();
    const known = buildWorkerSummary(makeWorker({ role: "worker" }), [], config, new Map(), NOW_MS);
    const unknown = buildWorkerSummary(
      makeWorker({ role: "ghost-role" }),
      [],
      config,
      new Map(),
      NOW_MS,
    );

    expect(known.roleLabel).toBe("实现");
    expect(unknown.roleLabel).toBe("ghost-role");
  });

  it("排队位置只在状态为排队中时才给出，其他状态一律为 null", () => {
    const worker = makeWorker({ latestRunSeq: 1 });
    const queuedRun = makeRun({ id: "w00001.1", seq: 1, status: "queued", startedAt: null });
    const queuePositions = new Map([["w00001.1", 3]]);

    const queuedSummary = buildWorkerSummary(
      worker,
      [queuedRun],
      baseConfig(),
      queuePositions,
      NOW_MS,
    );
    expect(queuedSummary.queuePosition).toBe(3);

    const runningRun = makeRun({ id: "w00001.1", seq: 1, status: "running" });
    const runningSummary = buildWorkerSummary(
      worker,
      [runningRun],
      baseConfig(),
      queuePositions,
      NOW_MS,
    );
    expect(runningSummary.queuePosition).toBeNull();
  });

  it("排队中但 Map 里没有对应记录时，排队位置为 null", () => {
    const worker = makeWorker({ latestRunSeq: 1 });
    const run = makeRun({ id: "w00001.1", seq: 1, status: "queued", startedAt: null });

    const summary = buildWorkerSummary(worker, [run], baseConfig(), new Map(), NOW_MS);

    expect(summary.queuePosition).toBeNull();
  });

  it("verdict 取自最新运行回报的解析结果", () => {
    const worker = makeWorker({ latestRunSeq: 1 });
    const withVerdict = buildWorkerSummary(
      worker,
      [makeRun({ id: "w00001.1", seq: 1, status: "completed", finalText: "SELF_REPORT: pass" })],
      baseConfig(),
      new Map(),
      NOW_MS,
    );
    const withoutFinalText = buildWorkerSummary(
      worker,
      [makeRun({ id: "w00001.1", seq: 1, status: "completed", finalText: null })],
      baseConfig(),
      new Map(),
      NOW_MS,
    );
    const unparsableFinalText = buildWorkerSummary(
      worker,
      [makeRun({ id: "w00001.1", seq: 1, status: "completed", finalText: "没有任何段头的闲聊" })],
      baseConfig(),
      new Map(),
      NOW_MS,
    );

    expect(withVerdict.verdict).toBe("pass");
    expect(withoutFinalText.verdict).toBeNull();
    expect(unparsableFinalText.verdict).toBeNull();
  });

  it("新字段直接取自苦工记录；没点名还没放行的苦工 poolId / model / channel / modelName 为 null", () => {
    const worker = makeWorker({
      requestedPool: null,
      poolId: null,
      model: null,
      channel: null,
      modelName: null,
    });

    const summary = buildWorkerSummary(worker, [], baseConfig(), new Map(), NOW_MS);

    expect(summary.requestedPool).toBeNull();
    expect(summary.poolId).toBeNull();
    expect(summary.model).toBeNull();
    expect(summary.channel).toBeNull();
    expect(summary.modelName).toBeNull();
  });

  it("runMs 累加各次运行；runMs 为 null 但已开跑的按 (endedAt ?? now) − startedAt 补", () => {
    const worker = makeWorker({ latestRunSeq: 3 });
    const runs = [
      // 结束时就记过 runMs，直接用现成的。
      makeRun({
        id: "w00001.1",
        seq: 1,
        status: "completed",
        startedAt: "2026-09-23T08:00:00.000Z",
        endedAt: "2026-09-23T08:30:00.000Z",
        runMs: 900_000,
      }),
      // runMs 缺失但已经结束，按 endedAt − startedAt 补。
      makeRun({
        id: "w00001.2",
        seq: 2,
        status: "completed",
        startedAt: "2026-09-23T08:40:00.000Z",
        endedAt: "2026-09-23T08:50:00.000Z",
        runMs: null,
      }),
      // 还在跑，按 now − startedAt 算。
      makeRun({
        id: "w00001.3",
        seq: 3,
        status: "running",
        startedAt: "2026-09-23T09:50:00.000Z",
        endedAt: null,
        runMs: null,
      }),
      // 还没开跑，不计入。
      makeRun({
        id: "w00001.4",
        seq: 4,
        status: "queued",
        startedAt: null,
        endedAt: null,
        runMs: null,
      }),
    ];

    const summary = buildWorkerSummary(worker, runs, baseConfig(), new Map(), NOW_MS);

    expect(summary.runMs).toBe(900_000 + 600_000 + 600_000);
  });
});

describe("buildRunView", () => {
  it("字段照抄 RunRecord，并把最后一条模型文字解析成结构化回报", () => {
    const run = makeRun({
      id: "w00001.1",
      seq: 1,
      status: "completed",
      finalText: "SUMMARY: 做完了\nSELF_REPORT: pass",
    });

    const view = buildRunView(run);

    expect(view.id).toBe(run.id);
    expect(view.seq).toBe(run.seq);
    expect(view.prompt).toBe(run.prompt);
    expect(view.usage).toEqual(run.usage);
    expect(view.report).toEqual({
      sections: [
        { key: "SUMMARY", text: "做完了" },
        { key: "SELF_REPORT", text: "pass" },
      ],
      verdict: "pass",
    });
  });

  it("finalText 为 null 时 report 为 null", () => {
    const view = buildRunView(makeRun({ finalText: null }));

    expect(view.report).toBeNull();
  });
});

describe("buildWorkerDetail", () => {
  it("按运行序号从小到大排好，且带上项目路径", () => {
    const worker = makeWorker({ latestRunSeq: 2 });
    const project = makeProject({ path: "C:/code/demo" });
    const runs = [
      makeRun({ id: "w00001.2", seq: 2, status: "running" }),
      makeRun({ id: "w00001.1", seq: 1, status: "completed" }),
    ];

    const detail = buildWorkerDetail(worker, runs, project, baseConfig(), new Map(), NOW_MS);

    expect(detail.projectPath).toBe("C:/code/demo");
    expect(detail.runs.map((run) => run.seq)).toEqual([1, 2]);
    expect(detail.summary.status).toBe("running");
  });
});
