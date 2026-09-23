import { describe, expect, it } from "vitest";
import type { PoolLimit, QueuedEntry, RunningEntry } from "../../src/scheduling/index.js";
import { planDispatch } from "../../src/scheduling/index.js";

function q(runId: string, poolId: string, projectKey: string, queuedAt: string): QueuedEntry {
  return { runId, poolId, projectKey, queuedAt };
}

function r(runId: string, poolId: string, projectKey: string): RunningEntry {
  return { runId, poolId, projectKey };
}

describe("planDispatch", () => {
  it("需求里的例子：容量 20，甲在跑 12/排队 10，乙在跑 0/排队 10，空位 8 全部来自乙", () => {
    const limits: PoolLimit[] = [{ poolId: "dsf", capacity: 20, perProjectCap: null }];
    const running: RunningEntry[] = Array.from({ length: 12 }, (_, i) =>
      r(`jia-run-${i}`, "dsf", "甲"),
    );
    const queued: QueuedEntry[] = [
      ...Array.from({ length: 10 }, (_, i) =>
        q(`jia-${i}`, "dsf", "甲", `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        q(`yi-${i}`, "dsf", "乙", `2026-01-01T00:01:${String(i).padStart(2, "0")}Z`),
      ),
    ];

    const dispatched = planDispatch(limits, running, queued);

    expect(dispatched).toHaveLength(8);
    expect(dispatched).toEqual(["yi-0", "yi-1", "yi-2", "yi-3", "yi-4", "yi-5", "yi-6", "yi-7"]);
    expect(dispatched.every((id) => id.startsWith("yi-"))).toBe(true);
  });

  it("容量上限：空位不够时只放行最前面的几个", () => {
    const limits: PoolLimit[] = [{ poolId: "p1", capacity: 5, perProjectCap: null }];
    const running: RunningEntry[] = [
      r("run-1", "p1", "a"),
      r("run-2", "p1", "a"),
      r("run-3", "p1", "a"),
    ];
    const queued: QueuedEntry[] = [
      q("q1", "p1", "a", "2026-01-01T00:00:00Z"),
      q("q2", "p1", "a", "2026-01-01T00:00:01Z"),
      q("q3", "p1", "a", "2026-01-01T00:00:02Z"),
      q("q4", "p1", "a", "2026-01-01T00:00:03Z"),
    ];

    // 在跑 3，容量 5，空位只有 2 个。
    expect(planDispatch(limits, running, queued)).toEqual(["q1", "q2"]);
  });

  it("容量 0 表示暂停放行：不放行任何排队", () => {
    const limits: PoolLimit[] = [{ poolId: "p1", capacity: 0, perProjectCap: null }];
    const queued: QueuedEntry[] = [q("q1", "p1", "a", "2026-01-01T00:00:00Z")];

    expect(planDispatch(limits, [], queued)).toEqual([]);
  });

  it("容量被调小到低于在跑数时：不放行任何排队，直到占用回落", () => {
    const limits: PoolLimit[] = [{ poolId: "p1", capacity: 3, perProjectCap: null }];
    const running: RunningEntry[] = Array.from({ length: 5 }, (_, i) => r(`run-${i}`, "p1", "a"));
    const queued: QueuedEntry[] = [q("q1", "p1", "a", "2026-01-01T00:00:00Z")];

    expect(planDispatch(limits, running, queued)).toEqual([]);
  });

  it("多个池互不影响：结果按 limits 顺序拼接", () => {
    const limits: PoolLimit[] = [
      { poolId: "p1", capacity: 1, perProjectCap: null },
      { poolId: "p2", capacity: 2, perProjectCap: null },
    ];
    const queued: QueuedEntry[] = [
      q("p1-a", "p1", "a", "2026-01-01T00:00:00Z"),
      q("p1-b", "p1", "b", "2026-01-01T00:00:01Z"),
      q("p2-a", "p2", "a", "2026-01-01T00:00:00Z"),
      q("p2-b", "p2", "b", "2026-01-01T00:00:01Z"),
    ];

    expect(planDispatch(limits, [], queued)).toEqual(["p1-a", "p2-a", "p2-b"]);
  });

  it("池不存在的排队条目被忽略", () => {
    const limits: PoolLimit[] = [{ poolId: "p1", capacity: 5, perProjectCap: null }];
    const queued: QueuedEntry[] = [
      q("q1", "p1", "a", "2026-01-01T00:00:00Z"),
      q("ghost", "removed-pool", "a", "2026-01-01T00:00:00Z"),
    ];

    expect(planDispatch(limits, [], queued)).toEqual(["q1"]);
  });
});
