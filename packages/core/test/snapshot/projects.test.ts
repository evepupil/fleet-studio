import { describe, expect, it } from "vitest";
import type { WorkerSummary } from "../../src/api/dto.js";
import { ZERO_USAGE } from "../../src/domain/usage.js";
import { buildProjectViews } from "../../src/snapshot/projects.js";
import { makeProject, makeRun, makeUsage, makeWorker } from "./fixtures.js";

const DAY_START = "2026-09-23T00:00:00.000Z";

/** 项目视图只吃 WorkerSummary（已经是快照苦工列表），这里手搭一个避免依赖 buildWorkerSummary 的行为。 */
function makeSummary(overrides: Partial<WorkerSummary> = {}): WorkerSummary {
  return {
    id: "w1",
    projectKey: "c:/code/demo",
    cwd: "C:/code/demo",
    title: "任务",
    role: "worker",
    roleLabel: "实现",
    runtime: "pi",
    requestedPool: "fast",
    poolId: "fast",
    model: "mcgrox/deepseek-v4.1-flash",
    channel: "mcgrox",
    modelName: "deepseek-v4.1-flash",
    status: "running",
    failReason: null,
    errorMessage: null,
    runSeq: 1,
    createdAt: "2026-09-23T00:00:00.000Z",
    queuedAt: "2026-09-23T00:00:00.000Z",
    startedAt: "2026-09-23T00:01:00.000Z",
    endedAt: null,
    lastActivityAt: null,
    activity: null,
    retry: null,
    verdict: null,
    usage: { ...ZERO_USAGE },
    runMs: 0,
    queuePosition: null,
    ...overrides,
  };
}

describe("buildProjectViews", () => {
  it("counts 五种状态键齐全，没有的为 0", () => {
    const summaries = [makeSummary({ projectKey: "c:/code/a", status: "running" })];

    const views = buildProjectViews(summaries, [], [], [], DAY_START);

    expect(views[0]?.counts).toEqual({
      queued: 0,
      running: 1,
      completed: 0,
      failed: 0,
      cancelled: 0,
    });
  });

  it("排序：有工作中苦工的项目排在前面，即便活动时间更早", () => {
    const summaries = [
      makeSummary({
        id: "wa",
        projectKey: "c:/code/a",
        status: "running",
        queuedAt: "2026-09-23T01:00:00.000Z",
      }),
      makeSummary({
        id: "wb",
        projectKey: "c:/code/b",
        status: "completed",
        endedAt: "2026-09-23T08:00:00.000Z",
      }),
    ];

    const views = buildProjectViews(summaries, [], [], [], DAY_START);

    expect(views.map((v) => v.key)).toEqual(["c:/code/a", "c:/code/b"]);
  });

  it("都没有工作中苦工时按 lastActivityAt 倒序", () => {
    const summaries = [
      makeSummary({
        id: "wa",
        projectKey: "c:/code/a",
        status: "completed",
        endedAt: "2026-09-23T01:00:00.000Z",
      }),
      makeSummary({
        id: "wb",
        projectKey: "c:/code/b",
        status: "completed",
        endedAt: "2026-09-23T08:00:00.000Z",
      }),
    ];

    const views = buildProjectViews(summaries, [], [], [], DAY_START);

    expect(views.map((v) => v.key)).toEqual(["c:/code/b", "c:/code/a"]);
  });

  it("状态和活动时间都并列时按 name 排序", () => {
    const summaries = [
      makeSummary({
        id: "wz",
        projectKey: "c:/code/z-proj",
        status: "completed",
        endedAt: "2026-09-23T01:00:00.000Z",
      }),
      makeSummary({
        id: "wa",
        projectKey: "c:/code/a-proj",
        status: "completed",
        endedAt: "2026-09-23T01:00:00.000Z",
      }),
    ];
    const projects = [
      makeProject({ key: "c:/code/z-proj", name: "z-proj" }),
      makeProject({ key: "c:/code/a-proj", name: "a-proj" }),
    ];

    const views = buildProjectViews(summaries, [], [], projects, DAY_START);

    expect(views.map((v) => v.name)).toEqual(["a-proj", "z-proj"]);
  });

  it("找不到项目记录时就地补一个：path 取 key，name 取最后一段，colorIndex 为 0", () => {
    const summaries = [makeSummary({ projectKey: "c:\\code\\orphan-project", status: "queued" })];

    const views = buildProjectViews(summaries, [], [], [], DAY_START);

    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({
      key: "c:\\code\\orphan-project",
      path: "c:\\code\\orphan-project",
      name: "orphan-project",
      colorIndex: 0,
    });
  });

  it("usageToday 按全部输入运行统计，不受快照苦工列表（已裁剪）限制", () => {
    // w1 在快照苦工列表里；w2 不在（模拟被 300 条上限裁掉），但它们同属项目 a。
    const summaries = [makeSummary({ id: "w1", projectKey: "c:/code/a", status: "running" })];
    const workers = [
      makeWorker({ id: "w1", projectKey: "c:/code/a" }),
      makeWorker({ id: "w2", projectKey: "c:/code/a" }),
    ];
    const runs = [
      makeRun({
        id: "w1.1",
        workerId: "w1",
        status: "running",
        startedAt: "2026-09-23T01:00:00.000Z",
        usage: makeUsage({ totalTokens: 100 }),
      }),
      makeRun({
        id: "w2.1",
        workerId: "w2",
        status: "completed",
        startedAt: "2026-09-23T02:00:00.000Z",
        endedAt: "2026-09-23T02:30:00.000Z",
        usage: makeUsage({ totalTokens: 50 }),
      }),
      makeRun({
        id: "w2.2",
        workerId: "w2",
        status: "completed",
        startedAt: "2026-09-22T23:00:00.000Z", // 昨天，不计入
        endedAt: "2026-09-22T23:30:00.000Z",
        usage: makeUsage({ totalTokens: 999 }),
      }),
    ];

    const views = buildProjectViews(summaries, workers, runs, [], DAY_START);

    expect(views[0]?.usageToday).toEqual(makeUsage({ totalTokens: 150 }));
  });

  it("lastActivityAt 取组内 lastActivityAt ?? endedAt ?? startedAt ?? queuedAt 的最大值", () => {
    const summaries = [
      makeSummary({
        id: "w1",
        projectKey: "c:/code/a",
        status: "completed",
        lastActivityAt: null,
        endedAt: "2026-09-23T03:00:00.000Z",
      }),
      makeSummary({
        id: "w2",
        projectKey: "c:/code/a",
        status: "completed",
        lastActivityAt: "2026-09-23T05:00:00.000Z",
        endedAt: "2026-09-23T01:00:00.000Z",
      }),
    ];

    const views = buildProjectViews(summaries, [], [], [], DAY_START);

    expect(views[0]?.lastActivityAt).toBe("2026-09-23T05:00:00.000Z");
  });

  it("只包含快照苦工列表里出现过的项目", () => {
    const summaries = [makeSummary({ projectKey: "c:/code/a" })];
    // c:/code/b 只出现在原始记录里，没有对应的快照苦工，不应该出现在结果里。
    const workers = [makeWorker({ id: "wb", projectKey: "c:/code/b" })];
    const runs = [makeRun({ id: "wb.1", workerId: "wb", startedAt: "2026-09-23T01:00:00.000Z" })];

    const views = buildProjectViews(summaries, workers, runs, [], DAY_START);

    expect(views.map((v) => v.key)).toEqual(["c:/code/a"]);
  });
});
