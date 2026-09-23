import { describe, expect, it } from "vitest";
import type { TimedRun } from "../../src/scheduling/index.js";
import { findExpired } from "../../src/scheduling/index.js";

const NOW = Date.parse("2026-01-01T00:30:00.000Z");
const THIRTY_MIN_MS = 30 * 60_000;
const TEN_MIN_MS = 10 * 60_000;

function runningRun(overrides: Partial<TimedRun> = {}): TimedRun {
  return {
    runId: "w1.1",
    status: "running",
    queuedAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:00.000Z",
    timeoutMs: THIRTY_MIN_MS,
    queueTimeoutMs: null,
    ...overrides,
  };
}

function queuedRun(overrides: Partial<TimedRun> = {}): TimedRun {
  return {
    runId: "w2.1",
    status: "queued",
    queuedAt: "2026-01-01T00:00:00.000Z",
    startedAt: null,
    timeoutMs: THIRTY_MIN_MS,
    queueTimeoutMs: TEN_MIN_MS,
    ...overrides,
  };
}

describe("findExpired", () => {
  it("空输入：没有任何运行", () => {
    expect(findExpired([], NOW)).toEqual([]);
  });

  it("工作中：恰好到点（差值 = timeoutMs）算超时", () => {
    // NOW(00:30) - startedAt(00:00) = 30 分钟，恰好等于 timeoutMs。
    const run = runningRun({
      runId: "a",
      startedAt: "2026-01-01T00:00:00.000Z",
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(findExpired([run], NOW)).toEqual([{ runId: "a", kind: "timeout" }]);
  });

  it("工作中：差一毫秒不到点，不算超时", () => {
    const run = runningRun({
      runId: "a",
      startedAt: "2026-01-01T00:00:00.001Z",
      timeoutMs: THIRTY_MIN_MS,
    });
    expect(findExpired([run], NOW)).toEqual([]);
  });

  it("工作中：startedAt 为 null（还没真正开跑）时不判超时", () => {
    const run = runningRun({ runId: "a", startedAt: null, timeoutMs: 0 });
    expect(findExpired([run], NOW)).toEqual([]);
  });

  it("排队中：恰好到点算排队超时", () => {
    // NOW(00:30) - queuedAt(00:20) = 10 分钟，恰好等于 queueTimeoutMs。
    const run = queuedRun({
      runId: "b",
      queuedAt: "2026-01-01T00:20:00.000Z",
      queueTimeoutMs: TEN_MIN_MS,
    });
    expect(findExpired([run], NOW)).toEqual([{ runId: "b", kind: "queue_timeout" }]);
  });

  it("排队中：差一毫秒不到点，不算排队超时", () => {
    const run = queuedRun({
      runId: "b",
      queuedAt: "2026-01-01T00:20:00.001Z",
      queueTimeoutMs: TEN_MIN_MS,
    });
    expect(findExpired([run], NOW)).toEqual([]);
  });

  it("排队不限时（queueTimeoutMs 为 null）：排多久都不算超时", () => {
    const run = queuedRun({
      runId: "c",
      queuedAt: "2020-01-01T00:00:00.000Z",
      queueTimeoutMs: null,
    });
    expect(findExpired([run], NOW)).toEqual([]);
  });

  it("时间解析不出来的条目跳过，不抛异常", () => {
    const badRunning = runningRun({ runId: "d", startedAt: "not-a-date" });
    const badQueued = queuedRun({ runId: "e", queuedAt: "not-a-date" });
    expect(() => findExpired([badRunning, badQueued], NOW)).not.toThrow();
    expect(findExpired([badRunning, badQueued], NOW)).toEqual([]);
  });

  it("输出顺序与输入顺序一致（不按池或类型重排）", () => {
    const first = runningRun({ runId: "g1", startedAt: "2020-01-01T00:00:00.000Z", timeoutMs: 1 });
    const middle = queuedRun({
      runId: "g2",
      queuedAt: "2026-01-01T00:29:00.000Z",
      queueTimeoutMs: TEN_MIN_MS,
    });
    const last = queuedRun({
      runId: "g3",
      queuedAt: "2020-01-01T00:00:00.000Z",
      queueTimeoutMs: 1,
    });

    expect(findExpired([first, middle, last], NOW)).toEqual([
      { runId: "g1", kind: "timeout" },
      { runId: "g3", kind: "queue_timeout" },
    ]);
  });
});
