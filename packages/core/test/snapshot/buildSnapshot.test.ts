import { describe, expect, it } from "vitest";
import type { RunRecord, WorkerRecord } from "../../src/domain/records.js";
import { buildSnapshot } from "../../src/snapshot/buildSnapshot.js";
import { baseConfig, makeProject, makeRun, makeWorker } from "./fixtures.js";

describe("buildSnapshot 挑苦工", () => {
  it("非终态苦工永远保留，不受快照窗口限制", () => {
    const config = baseConfig({ snapshotWindowHours: 1 });
    const worker = makeWorker({
      id: "wold",
      createdAt: "2020-01-01T00:00:00.000Z",
      latestRunSeq: 1,
    });
    const run = makeRun({
      id: "wold.1",
      workerId: "wold",
      seq: 1,
      status: "queued",
      startedAt: null,
      queuedAt: "2020-01-01T00:00:00.000Z",
    });

    const snapshot = buildSnapshot({
      version: "test",
      now: "2026-09-24T10:00:00.000Z",
      dayStart: "2026-09-24T00:00:00.000Z",
      config,
      configError: null,
      projects: [],
      workers: [worker],
      runs: [run],
      queuePositions: new Map(),
    });

    expect(snapshot.workers.map((w) => w.id)).toEqual(["wold"]);
  });

  it("终态苦工按结束时间是否落在快照窗口内筛选", () => {
    const config = baseConfig({ snapshotWindowHours: 2 });
    const now = "2026-09-24T10:00:00.000Z";
    const inWindow = makeWorker({ id: "win", latestRunSeq: 1 });
    const outOfWindow = makeWorker({ id: "wout", latestRunSeq: 1 });
    const runs = [
      makeRun({
        id: "win.1",
        workerId: "win",
        seq: 1,
        status: "completed",
        startedAt: "2026-09-24T08:30:00.000Z",
        endedAt: "2026-09-24T09:00:00.000Z", // now - 1h，窗口 2h 之内
      }),
      makeRun({
        id: "wout.1",
        workerId: "wout",
        seq: 1,
        status: "completed",
        startedAt: "2026-09-24T06:30:00.000Z",
        endedAt: "2026-09-24T07:00:00.000Z", // now - 3h，窗口 2h 之外
      }),
    ];

    const snapshot = buildSnapshot({
      version: "test",
      now,
      dayStart: "2026-09-24T00:00:00.000Z",
      config,
      configError: null,
      projects: [],
      workers: [inWindow, outOfWindow],
      runs,
      queuePositions: new Map(),
    });

    expect(snapshot.workers.map((w) => w.id)).toEqual(["win"]);
  });

  it("超过 300 个时，非终态全部保留，终态挑结束最晚的补足剩余名额", () => {
    const config = baseConfig();
    const now = "2026-09-24T10:00:00.000Z";
    const nowMs = Date.parse(now);

    const nonTerminalWorkers: WorkerRecord[] = [];
    const nonTerminalRuns: RunRecord[] = [];
    for (let i = 0; i < 10; i += 1) {
      const id = `wnt${i}`;
      nonTerminalWorkers.push(makeWorker({ id, createdAt: now, latestRunSeq: 1 }));
      nonTerminalRuns.push(
        makeRun({ id: `${id}.1`, workerId: id, seq: 1, status: "running", startedAt: now }),
      );
    }

    // 295 条终态记录，结束时间依次错开 1 分钟；i 越大结束越晚（越接近 now）。
    const terminalWorkers: WorkerRecord[] = [];
    const terminalRuns: RunRecord[] = [];
    const terminalCount = 295;
    for (let i = 0; i < terminalCount; i += 1) {
      const id = `wt${i}`;
      const endedAt = new Date(nowMs - (terminalCount - i) * 60_000).toISOString();
      terminalWorkers.push(makeWorker({ id, createdAt: now, latestRunSeq: 1 }));
      terminalRuns.push(
        makeRun({
          id: `${id}.1`,
          workerId: id,
          seq: 1,
          status: "completed",
          startedAt: now,
          endedAt,
        }),
      );
    }

    const snapshot = buildSnapshot({
      version: "test",
      now,
      dayStart: "2026-09-24T00:00:00.000Z",
      config,
      configError: null,
      projects: [],
      workers: [...nonTerminalWorkers, ...terminalWorkers],
      runs: [...nonTerminalRuns, ...terminalRuns],
      queuePositions: new Map(),
    });

    expect(snapshot.workers).toHaveLength(300);
    const ids = new Set(snapshot.workers.map((w) => w.id));
    // 10 个非终态全部保留。
    for (let i = 0; i < 10; i += 1) {
      expect(ids.has(`wnt${i}`)).toBe(true);
    }
    // 剩余 290 个名额给结束最晚的：最旧的 5 个（wt0..wt4）应该被挤掉。
    for (let i = 0; i < 5; i += 1) {
      expect(ids.has(`wt${i}`)).toBe(false);
    }
    for (let i = 5; i < terminalCount; i += 1) {
      expect(ids.has(`wt${i}`)).toBe(true);
    }
  });

  it("输出按 createdAt 倒序，相同再按 id 排序", () => {
    const config = baseConfig();
    const now = "2026-09-24T10:00:00.000Z";
    const workers = [
      makeWorker({ id: "wb", createdAt: "2026-09-24T08:00:00.000Z", latestRunSeq: 1 }),
      makeWorker({ id: "wa", createdAt: "2026-09-24T09:00:00.000Z", latestRunSeq: 1 }),
      // 两个 createdAt 相同，靠 id 排序（升序）。
      makeWorker({ id: "wc2", createdAt: "2026-09-24T09:00:00.000Z", latestRunSeq: 1 }),
      makeWorker({ id: "wc1", createdAt: "2026-09-24T09:00:00.000Z", latestRunSeq: 1 }),
    ];
    const runs = workers.map((worker) =>
      makeRun({
        id: `${worker.id}.1`,
        workerId: worker.id,
        seq: 1,
        status: "running",
        startedAt: now,
      }),
    );

    const snapshot = buildSnapshot({
      version: "test",
      now,
      dayStart: "2026-09-24T00:00:00.000Z",
      config,
      configError: null,
      projects: [],
      workers,
      runs,
      queuePositions: new Map(),
    });

    expect(snapshot.workers.map((w) => w.id)).toEqual(["wa", "wc1", "wc2", "wb"]);
  });
});

describe("buildSnapshot 整体组装", () => {
  it("version / serverTime / configError / roles 照抄输入", () => {
    const config = baseConfig();

    const snapshot = buildSnapshot({
      version: "1.2.3",
      now: "2026-09-24T10:00:00.000Z",
      dayStart: "2026-09-24T00:00:00.000Z",
      config,
      configError: "配置文件第 3 行格式不对",
      projects: [],
      workers: [],
      runs: [],
      queuePositions: new Map(),
    });

    expect(snapshot.version).toBe("1.2.3");
    expect(snapshot.serverTime).toBe("2026-09-24T10:00:00.000Z");
    expect(snapshot.configError).toBe("配置文件第 3 行格式不对");
    expect(snapshot.roles).toEqual([
      { id: "worker", label: "实现", description: "" },
      { id: "reviewer", label: "评审", description: "" },
    ]);
    expect(snapshot.pools.map((p) => p.id)).toEqual(["fast", "oc"]);
    expect(snapshot.projects).toEqual([]);
  });

  it("挑出的苦工会同时体现在 workers 和 projects 里", () => {
    const config = baseConfig();
    const project = makeProject({ key: "c:/code/demo", path: "C:/code/demo", name: "demo" });
    const worker = makeWorker({ id: "w1", projectKey: "c:/code/demo", latestRunSeq: 1 });
    const run = makeRun({
      id: "w1.1",
      workerId: "w1",
      seq: 1,
      status: "running",
      startedAt: "2026-09-24T09:00:00.000Z",
    });

    const snapshot = buildSnapshot({
      version: "test",
      now: "2026-09-24T10:00:00.000Z",
      dayStart: "2026-09-24T00:00:00.000Z",
      config,
      configError: null,
      projects: [project],
      workers: [worker],
      runs: [run],
      queuePositions: new Map(),
    });

    expect(snapshot.workers.map((w) => w.id)).toEqual(["w1"]);
    expect(snapshot.projects.map((p) => p.key)).toEqual(["c:/code/demo"]);
    expect(snapshot.projects[0]?.counts.running).toBe(1);
  });
});
