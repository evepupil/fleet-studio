import { describe, expect, it } from "vitest";
import { buildPoolViews } from "../../src/snapshot/pools.js";
import { baseConfig, makeRun, makeWorker } from "./fixtures.js";

const NOW = "2026-09-23T10:00:00.000Z";
const DAY_START = "2026-09-23T00:00:00.000Z";

/** 只取 fast 池的视图，方便断言（baseConfig 还带了一个 oc 池，本文件大多数用例不关心它）。 */
function fastPoolView(
  workers: Parameters<typeof buildPoolViews>[1],
  runs: Parameters<typeof buildPoolViews>[2],
) {
  const config = baseConfig();
  const views = buildPoolViews(config.pools, workers, runs, config.roles, NOW, DAY_START);
  const fast = views.find((view) => view.id === "fast");
  if (!fast) {
    throw new Error("测试固件里缺 fast 池");
  }
  return fast;
}

describe("buildPoolViews：模型显示名 / 计数 / 容量条格子排序", () => {
  it("model 按池配置的运行时分支拼出显示名", () => {
    const config = baseConfig();
    const views = buildPoolViews(config.pools, [], [], config.roles, NOW, DAY_START);

    expect(views.find((v) => v.id === "fast")?.model).toBe("mcgrox/deepseek-v4.1-flash");
    expect(views.find((v) => v.id === "oc")?.model).toBe("gpt-5-mini");
  });

  it("running / queued 按苦工所属池统计，capacity / perProjectCap 照抄配置", () => {
    const workers = [
      makeWorker({ id: "w1", poolId: "fast", projectKey: "c:/code/a" }),
      makeWorker({ id: "w2", poolId: "fast", projectKey: "c:/code/a" }),
      makeWorker({ id: "w3", poolId: "oc", projectKey: "c:/code/a" }),
    ];
    const runs = [
      makeRun({ id: "w1.1", workerId: "w1", status: "running" }),
      makeRun({ id: "w2.1", workerId: "w2", status: "queued", startedAt: null }),
      makeRun({ id: "w3.1", workerId: "w3", status: "running" }), // 属于 oc 池，不应计入 fast
    ];

    const fast = fastPoolView(workers, runs);

    expect(fast.running).toBe(1);
    expect(fast.queued).toBe(1);
    expect(fast.capacity).toBe(4);
    expect(fast.perProjectCap).toBeNull();
  });

  it("slots 分段：在跑数多的项目在前，段内按开跑时间升序", () => {
    const workers = [
      makeWorker({ id: "wA1", poolId: "fast", projectKey: "c:/code/a" }),
      makeWorker({ id: "wA2", poolId: "fast", projectKey: "c:/code/a" }),
      makeWorker({ id: "wB1", poolId: "fast", projectKey: "c:/code/b" }),
    ];
    const runs = [
      makeRun({
        id: "wA1.1",
        workerId: "wA1",
        status: "running",
        startedAt: "2026-09-23T09:55:00.000Z",
      }),
      makeRun({
        id: "wA2.1",
        workerId: "wA2",
        status: "running",
        startedAt: "2026-09-23T09:50:00.000Z",
      }),
      makeRun({
        id: "wB1.1",
        workerId: "wB1",
        status: "running",
        startedAt: "2026-09-23T09:52:00.000Z",
      }),
    ];

    const fast = fastPoolView(workers, runs);

    // 项目 a 有 2 个在跑，排在项目 b（1 个）前面；a 段内部按开跑时间升序：wA2（09:50）先于 wA1（09:55）。
    expect(fast.slots.map((slot) => slot.runId)).toEqual(["wA2.1", "wA1.1", "wB1.1"]);
  });

  it("slots 并列时按项目最早开跑时间在前，再并列按 projectKey 字典序", () => {
    const workersEarliestWins = [
      makeWorker({ id: "wP1", poolId: "fast", projectKey: "c:/code/p" }),
      makeWorker({ id: "wQ1", poolId: "fast", projectKey: "c:/code/q" }),
    ];
    const runsEarliestWins = [
      makeRun({
        id: "wP1.1",
        workerId: "wP1",
        status: "running",
        startedAt: "2026-09-23T09:58:00.000Z",
      }),
      makeRun({
        id: "wQ1.1",
        workerId: "wQ1",
        status: "running",
        startedAt: "2026-09-23T09:55:00.000Z",
      }),
    ];
    // 数量都是 1，q 项目更早开跑，应该排在字典序更靠前的 p 之前。
    expect(
      fastPoolView(workersEarliestWins, runsEarliestWins).slots.map((s) => s.projectKey),
    ).toEqual(["c:/code/q", "c:/code/p"]);

    const workersLexicalTie = [
      makeWorker({ id: "wX1", poolId: "fast", projectKey: "c:/code/x" }),
      makeWorker({ id: "wY1", poolId: "fast", projectKey: "c:/code/y" }),
    ];
    const runsLexicalTie = [
      makeRun({
        id: "wX1.1",
        workerId: "wX1",
        status: "running",
        startedAt: "2026-09-23T09:55:00.000Z",
      }),
      makeRun({
        id: "wY1.1",
        workerId: "wY1",
        status: "running",
        startedAt: "2026-09-23T09:55:00.000Z",
      }),
    ];
    // 数量、最早开跑时间都相同，按 projectKey 字典序：x 在 y 前面。
    expect(fastPoolView(workersLexicalTie, runsLexicalTie).slots.map((s) => s.projectKey)).toEqual([
      "c:/code/x",
      "c:/code/y",
    ]);
  });

  it("同一项目内开跑时间也相同时，按 runId 排序；retrying 标出正在重试的运行", () => {
    const workers = [
      makeWorker({ id: "wZ1", poolId: "fast", projectKey: "c:/code/z" }),
      makeWorker({ id: "wZ2", poolId: "fast", projectKey: "c:/code/z" }),
    ];
    const runs = [
      makeRun({
        id: "wZ2.1",
        workerId: "wZ2",
        status: "running",
        startedAt: "2026-09-23T09:55:00.000Z",
        retry: { attempt: 1, max: 3, message: "通道超时" },
      }),
      makeRun({
        id: "wZ1.1",
        workerId: "wZ1",
        status: "running",
        startedAt: "2026-09-23T09:55:00.000Z",
        retry: null,
      }),
    ];

    const fast = fastPoolView(workers, runs);

    expect(fast.slots.map((s) => s.runId)).toEqual(["wZ1.1", "wZ2.1"]);
    expect(fast.slots.find((s) => s.runId === "wZ2.1")?.retrying).toBe(true);
    expect(fast.slots.find((s) => s.runId === "wZ1.1")?.retrying).toBe(false);
  });

  it("queuedByProject 先按 slots 的项目顺序，其余项目按各自最早排队时间", () => {
    const workers = [
      makeWorker({ id: "wA1", poolId: "fast", projectKey: "c:/code/a" }),
      makeWorker({ id: "wA2", poolId: "fast", projectKey: "c:/code/a" }),
      makeWorker({ id: "wC1", poolId: "fast", projectKey: "c:/code/c" }),
      makeWorker({ id: "wC2", poolId: "fast", projectKey: "c:/code/c" }),
      makeWorker({ id: "wD1", poolId: "fast", projectKey: "c:/code/d" }),
    ];
    const runs = [
      // 项目 a：1 个在跑（进 slots），1 个排队
      makeRun({
        id: "wA1.1",
        workerId: "wA1",
        status: "running",
        startedAt: "2026-09-23T09:55:00.000Z",
      }),
      makeRun({
        id: "wA2.1",
        workerId: "wA2",
        status: "queued",
        startedAt: null,
        queuedAt: "2026-09-23T09:57:00.000Z",
      }),
      // 项目 c：没有在跑，2 个排队，最早排队时间比 d 晚
      makeRun({
        id: "wC1.1",
        workerId: "wC1",
        status: "queued",
        startedAt: null,
        queuedAt: "2026-09-23T09:51:00.000Z",
      }),
      makeRun({
        id: "wC2.1",
        workerId: "wC2",
        status: "queued",
        startedAt: null,
        queuedAt: "2026-09-23T09:59:00.000Z",
      }),
      // 项目 d：没有在跑，1 个排队，最早排队时间比 c 早
      makeRun({
        id: "wD1.1",
        workerId: "wD1",
        status: "queued",
        startedAt: null,
        queuedAt: "2026-09-23T09:40:00.000Z",
      }),
    ];

    const fast = fastPoolView(workers, runs);

    expect(fast.slots.map((s) => s.projectKey)).toEqual(["c:/code/a"]);
    expect(fast.queuedByProject).toEqual([
      { projectKey: "c:/code/a", count: 1 },
      { projectKey: "c:/code/d", count: 1 },
      { projectKey: "c:/code/c", count: 2 },
    ]);
  });
});
