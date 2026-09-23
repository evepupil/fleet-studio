import { describe, expect, it } from "vitest";
import type { PoolLimit, QueuedEntry, RunningEntry } from "../../src/scheduling/index.js";
import { queuePositions } from "../../src/scheduling/index.js";

function q(runId: string, poolId: string, projectKey: string, queuedAt: string): QueuedEntry {
  return { runId, poolId, projectKey, queuedAt };
}

function r(runId: string, poolId: string, projectKey: string): RunningEntry {
  return { runId, poolId, projectKey };
}

describe("queuePositions", () => {
  it("与 dispatchOrder 的公平顺序一致：eligible 部分按顺序编号", () => {
    const limits: PoolLimit[] = [{ poolId: "p1", capacity: 100, perProjectCap: null }];
    const running: RunningEntry[] = [r("run-1", "p1", "a"), r("run-2", "p1", "a")];
    const queued: QueuedEntry[] = [
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
    const limits: PoolLimit[] = [{ poolId: "p1", capacity: 100, perProjectCap: 1 }];
    const running: RunningEntry[] = [r("run-1", "p1", "a")];
    const queued: QueuedEntry[] = [
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

  it("池不存在的排队条目不出现在结果里", () => {
    const limits: PoolLimit[] = [{ poolId: "p1", capacity: 100, perProjectCap: null }];
    const queued: QueuedEntry[] = [
      q("a1", "p1", "a", "2026-01-01T00:00:00Z"),
      q("ghost", "removed-pool", "a", "2026-01-01T00:00:00Z"),
    ];

    const positions = queuePositions(limits, [], queued);

    expect(positions.get("a1")).toBe(1);
    expect(positions.has("ghost")).toBe(false);
    expect(positions.size).toBe(1);
  });

  it("多个池分别独立编号", () => {
    const limits: PoolLimit[] = [
      { poolId: "p1", capacity: 100, perProjectCap: null },
      { poolId: "p2", capacity: 100, perProjectCap: null },
    ];
    const queued: QueuedEntry[] = [
      q("p1-a", "p1", "a", "2026-01-01T00:00:00Z"),
      q("p2-a", "p2", "a", "2026-01-01T00:00:00Z"),
    ];

    const positions = queuePositions(limits, [], queued);

    expect(positions.get("p1-a")).toBe(1);
    expect(positions.get("p2-a")).toBe(1);
  });
});
