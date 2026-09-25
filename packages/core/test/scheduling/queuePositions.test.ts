import { describe, expect, it } from "vitest";
import type { RuntimeId } from "../../src/domain/status.js";
import type { PoolLimit, QueuedEntry, RunningEntry } from "../../src/scheduling/index.js";
import { queuePositions } from "../../src/scheduling/index.js";

interface PoolOptions {
  capacity: number;
  perProjectCap?: number | null;
  enabled?: boolean;
  runtimes?: readonly RuntimeId[];
}

function pool(poolId: string, options: PoolOptions): PoolLimit {
  return {
    poolId,
    capacity: options.capacity,
    perProjectCap: options.perProjectCap ?? null,
    enabled: options.enabled ?? true,
    runtimes: options.runtimes ?? ["pi", "opencode"],
  };
}

function q(
  runId: string,
  poolId: string,
  projectKey: string,
  queuedAt: string,
  runtime: RuntimeId = "pi",
): QueuedEntry {
  return { runId, requestedPoolId: poolId, runtime, projectKey, queuedAt };
}

function shared(
  runId: string,
  projectKey: string,
  queuedAt: string,
  runtime: RuntimeId = "pi",
): QueuedEntry {
  return { runId, requestedPoolId: null, runtime, projectKey, queuedAt };
}

function r(runId: string, poolId: string, projectKey: string): RunningEntry {
  return { runId, poolId, projectKey };
}

describe("queuePositions", () => {
  it("与 dispatchOrder 的公平顺序一致：eligible 部分按顺序编号", () => {
    const limits = [pool("p1", { capacity: 100 })];
    const running = [r("run-1", "p1", "a"), r("run-2", "p1", "a")];
    const queued = [
      q("a1", "p1", "a", "2026-01-01T00:00:00Z"),
      q("b1", "p1", "b", "2026-01-01T00:00:01Z"),
      q("b2", "p1", "b", "2026-01-01T00:00:02Z"),
    ];

    const positions = queuePositions(limits, running, queued);

    // b 在跑 0 个，优先补：b1 排第 1，b2 排第 2；a 已经在跑 2 个，排最后。
    expect(positions.get("b1")).toBe(1);
    expect(positions.get("b2")).toBe(2);
    expect(positions.get("a1")).toBe(3);
  });

  it("blocked 排在 eligible 后面，接着编号", () => {
    const limits = [pool("p1", { capacity: 100, perProjectCap: 1 })];
    const running = [r("run-1", "p1", "a")];
    const queued = [
      q("a1", "p1", "a", "2026-01-01T00:00:00Z"),
      q("a2", "p1", "a", "2026-01-01T00:00:01Z"),
      q("b1", "p1", "b", "2026-01-01T00:00:02Z"),
    ];

    const positions = queuePositions(limits, running, queued);

    // b1 是唯一的 eligible，排第 1；a1、a2 被单项目上限挡住，接着往后编号。
    expect(positions.get("b1")).toBe(1);
    expect(positions.get("a1")).toBe(2);
    expect(positions.get("a2")).toBe(3);
  });

  it("点名已删除的池的排队条目不出现在结果里", () => {
    const limits = [pool("p1", { capacity: 100 })];
    const queued = [
      q("a1", "p1", "a", "2026-01-01T00:00:00Z"),
      q("ghost", "removed-pool", "a", "2026-01-01T00:00:00Z"),
    ];

    const positions = queuePositions(limits, [], queued);

    expect(positions.get("a1")).toBe(1);
    expect(positions.has("ghost")).toBe(false);
    expect(positions.size).toBe(1);
  });

  it("多个池分别独立编号", () => {
    const limits = [pool("p1", { capacity: 100 }), pool("p2", { capacity: 100 })];
    const queued = [
      q("p1-a", "p1", "a", "2026-01-01T00:00:00Z"),
      q("p2-a", "p2", "a", "2026-01-01T00:00:00Z"),
    ];

    const positions = queuePositions(limits, [], queued);

    expect(positions.get("p1-a")).toBe(1);
    expect(positions.get("p2-a")).toBe(1);
  });

  it("公共排队单独按排队时间编号，不占任何池的编号（M5 规格）", () => {
    const limits = [pool("p1", { capacity: 100 }), pool("p2", { capacity: 100 })];
    const queued = [
      q("named", "p1", "a", "2026-01-01T00:00:00Z"),
      shared("s2", "a", "2026-01-01T00:00:02Z"),
      shared("s1", "a", "2026-01-01T00:00:01Z"),
    ];

    const positions = queuePositions(limits, [], queued);

    // 点名的 named 在 p1 里排第 1；公共排队的 s1、s2 单独从 1 开始，按时间先后。
    expect(positions.get("named")).toBe(1);
    expect(positions.get("s1")).toBe(1);
    expect(positions.get("s2")).toBe(2);
  });

  it("公共排队的运行虽然参与池的 dispatchOrder，但不占这个池的点名编号", () => {
    const limits = [pool("p1", { capacity: 100 })];
    const queued = [
      shared("s1", "b", "2026-01-01T00:00:00Z"),
      q("named", "p1", "a", "2026-01-01T00:00:05Z"),
    ];

    const positions = queuePositions(limits, [], queued);

    // s1 在 p1 的公平顺序里排第一（占得少、排队早），但它是公共排队，编号走公共那套；
    // named 是 p1 里唯一的点名条目，所以排第 1。
    expect(positions.get("named")).toBe(1);
    expect(positions.get("s1")).toBe(1);
  });

  it("运行时不被池支持的公共排队：不参与这个池的编号，但仍有公共排队的位置", () => {
    const limits = [pool("p1", { capacity: 100, runtimes: ["pi"] })];
    const queued = [shared("oc1", "a", "2026-01-01T00:00:00Z", "opencode")];

    const positions = queuePositions(limits, [], queued);

    expect(positions.get("oc1")).toBe(1);
    expect(positions.size).toBe(1);
  });

  it("停用的池照样编号（位置是「一旦启用」的顺序）", () => {
    const limits = [pool("p1", { capacity: 100, enabled: false })];
    const queued = [q("a1", "p1", "a", "2026-01-01T00:00:00Z")];

    const positions = queuePositions(limits, [], queued);

    expect(positions.get("a1")).toBe(1);
  });
});
