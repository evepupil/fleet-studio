import { describe, expect, it } from "vitest";
import type { PoolLimit, QueuedEntry, RunningEntry } from "../../src/scheduling/index.js";
import { dispatchOrder } from "../../src/scheduling/index.js";

const POOL = "p1";

function limit(overrides: Partial<PoolLimit> = {}): PoolLimit {
  return { poolId: POOL, capacity: 100, perProjectCap: null, ...overrides };
}

function q(runId: string, projectKey: string, queuedAt: string, poolId = POOL): QueuedEntry {
  return { runId, poolId, projectKey, queuedAt };
}

function r(runId: string, projectKey: string, poolId = POOL): RunningEntry {
  return { runId, poolId, projectKey };
}

describe("dispatchOrder", () => {
  it("空输入：没有排队也没有在跑", () => {
    const result = dispatchOrder(limit(), [], []);
    expect(result).toEqual({ eligible: [], blocked: [] });
  });

  it("单项目先来先到：乱序输入也按 queuedAt 排好", () => {
    const queued = [
      q("a3", "a", "2026-01-01T00:00:03Z"),
      q("a1", "a", "2026-01-01T00:00:01Z"),
      q("a2", "a", "2026-01-01T00:00:02Z"),
    ];
    const result = dispatchOrder(limit(), [], queued);
    expect(result).toEqual({ eligible: ["a1", "a2", "a3"], blocked: [] });
  });

  it("两项目交替：占用打平后比队首排队时间，产出交替顺序", () => {
    const queued = [
      q("a1", "a", "2026-01-01T00:00:00Z"),
      q("a2", "a", "2026-01-01T00:00:02Z"),
      q("b1", "b", "2026-01-01T00:00:01Z"),
      q("b2", "b", "2026-01-01T00:00:03Z"),
    ];
    const result = dispatchOrder(limit(), [], queued);
    expect(result.eligible).toEqual(["a1", "b1", "a2", "b2"]);
    expect(result.blocked).toEqual([]);
  });

  it("占用少的项目优先：即使排队晚，占用少也先补", () => {
    const running = [r("a-run-1", "a"), r("a-run-2", "a")];
    const queued = [
      q("a1", "a", "2026-01-01T00:00:00Z"),
      q("a2", "a", "2026-01-01T00:00:01Z"),
      q("b1", "b", "2026-01-01T00:00:10Z"),
      q("b2", "b", "2026-01-01T00:00:11Z"),
    ];
    const result = dispatchOrder(limit(), running, queued);
    // b 在跑 0 个，即使排队比 a 晚也先补；补到和 a 打平（2）后再交替。
    expect(result.eligible).toEqual(["b1", "b2", "a1", "a2"]);
  });

  it("并列时队首排队更早的项目优先（而不是按项目编号）", () => {
    const queued = [q("z1", "z", "2026-01-01T00:00:00Z"), q("a1", "a", "2026-01-01T00:00:05Z")];
    const result = dispatchOrder(limit(), [], queued);
    expect(result.eligible).toEqual(["z1", "a1"]);
  });

  it("占用和队首排队时间都打平时，按项目编号字典序小的优先", () => {
    const queued = [q("b1", "b", "2026-01-01T00:00:00Z"), q("a1", "a", "2026-01-01T00:00:00Z")];
    const result = dispatchOrder(limit(), [], queued);
    expect(result.eligible).toEqual(["a1", "b1"]);
  });

  it("单项目上限挡住后进 blocked，按排队时间排好；其他项目不受影响", () => {
    const running = [r("a-run-1", "a")];
    const queued = [
      q("a1", "a", "2026-01-01T00:00:00Z"),
      q("a2", "a", "2026-01-01T00:00:01Z"),
      q("b1", "b", "2026-01-01T00:00:02Z"),
    ];
    const result = dispatchOrder(limit({ perProjectCap: 1 }), running, queued);
    // a 已经占满上限 1 个，排队的两个都进 blocked；b 没占用，正常放行。
    expect(result.eligible).toEqual(["b1"]);
    expect(result.blocked).toEqual(["a1", "a2"]);
  });

  it("单项目上限：放行过程中触顶后停止，剩下的转入 blocked", () => {
    const queued = [
      q("a1", "a", "2026-01-01T00:00:00Z"),
      q("a2", "a", "2026-01-01T00:00:01Z"),
      q("a3", "a", "2026-01-01T00:00:02Z"),
    ];
    const result = dispatchOrder(limit({ perProjectCap: 2 }), [], queued);
    expect(result.eligible).toEqual(["a1", "a2"]);
    expect(result.blocked).toEqual(["a3"]);
  });

  it("其他池的条目被忽略：不影响占用计数也不出现在结果里", () => {
    const running = [r("other-run", "a", "other-pool")];
    const queued = [
      q("a1", "a", "2026-01-01T00:00:00Z"),
      q("ghost", "a", "2026-01-01T00:00:00Z", "other-pool"),
    ];
    const result = dispatchOrder(limit(), running, queued);
    expect(result.eligible).toEqual(["a1"]);
    expect(result.blocked).toEqual([]);
  });

  it("排序不看容量还剩几个空位：即便池已经满了，也能算出完整的公平顺序", () => {
    const queued = [q("a1", "a", "2026-01-01T00:00:00Z"), q("b1", "b", "2026-01-01T00:00:01Z")];
    const result = dispatchOrder(limit({ capacity: 0 }), [], queued);
    expect(result.eligible).toEqual(["a1", "b1"]);
  });
});
