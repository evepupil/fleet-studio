import { describe, expect, it } from "vitest";
import type { RuntimeId } from "../../src/domain/status.js";
import type { PoolLimit, QueuedEntry, RunningEntry } from "../../src/scheduling/index.js";
import { dispatchOrder } from "../../src/scheduling/index.js";

const POOL = "p1";

function limit(overrides: Partial<PoolLimit> = {}): PoolLimit {
  return {
    poolId: POOL,
    capacity: 100,
    perProjectCap: null,
    enabled: true,
    runtimes: ["pi", "opencode"],
    ...overrides,
  };
}

/** 默认点名 POOL、运行时 pi；公共排队传 requestedPoolId: null。 */
function q(
  runId: string,
  projectKey: string,
  queuedAt: string,
  overrides: Partial<QueuedEntry> = {},
): QueuedEntry {
  return { runId, requestedPoolId: POOL, runtime: "pi", projectKey, queuedAt, ...overrides };
}

function r(runId: string, projectKey: string, poolId = POOL): RunningEntry {
  return { runId, poolId, projectKey };
}

function publicQ(
  runId: string,
  projectKey: string,
  queuedAt: string,
  runtime: RuntimeId = "pi",
): QueuedEntry {
  return q(runId, projectKey, queuedAt, { requestedPoolId: null, runtime });
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

  it("两个项目同时被单项目上限挡住：blocked 按全局排队时间跨项目交叉排序，不按项目分组拼接（D6①）", () => {
    const queued = [
      q("a1", "a", "2026-01-01T00:00:00Z"),
      q("a2", "a", "2026-01-01T00:00:02Z"),
      q("a3", "a", "2026-01-01T00:00:04Z"),
      q("b1", "b", "2026-01-01T00:00:01Z"),
      q("b2", "b", "2026-01-01T00:00:03Z"),
      q("b3", "b", "2026-01-01T00:00:05Z"),
    ];
    const result = dispatchOrder(limit({ perProjectCap: 1 }), [], queued);
    // a、b 各自放行队首一个就撞上限 1；剩下的 a2/a3/b2/b3 按各自排队时间整体重新排序，
    // 应该交替出现 a2、b2、a3、b3。如果实现退化成“按项目分组再拼接剩余队列”，
    // 这里会得到 [a2, a3, b2, b3]，跟按全局时间交叉排序的预期不一致。
    expect(result.eligible).toEqual(["a1", "b1"]);
    expect(result.blocked).toEqual(["a2", "b2", "a3", "b3"]);
  });

  it("点名别的池的条目被忽略：不影响占用计数也不出现在结果里", () => {
    const running = [r("other-run", "a", "other-pool")];
    const queued = [
      q("a1", "a", "2026-01-01T00:00:00Z"),
      q("ghost", "a", "2026-01-01T00:00:00Z", { requestedPoolId: "other-pool" }),
    ];
    const result = dispatchOrder(limit(), running, queued);
    expect(result.eligible).toEqual(["a1"]);
    expect(result.blocked).toEqual([]);
  });

  it("公共排队：运行时被这个池支持的才参与（M5 例子 5）", () => {
    const piOnly = limit({ poolId: "jia", runtimes: ["pi"] });
    const queued = [
      publicQ("oc1", "a", "2026-01-01T00:00:00Z", "opencode"),
      publicQ("pi1", "a", "2026-01-01T00:00:01Z", "pi"),
    ];
    const result = dispatchOrder(piOnly, [], queued);
    // 甲只配了 pi，opencode 的公共排队跟它无关。
    expect(result.eligible).toEqual(["pi1"]);
    expect(result.blocked).toEqual([]);
  });

  it("公共排队与点名排队一起排序：点名不改变公平规则，只改变候选范围", () => {
    const queued = [
      q("named", "a", "2026-01-01T00:00:05Z"),
      publicQ("shared", "b", "2026-01-01T00:00:00Z"),
    ];
    const result = dispatchOrder(limit(), [], queued);
    // b 占用 0、排队更早，先放；点名只是让 named 出现在这个池的候选里。
    expect(result.eligible).toEqual(["shared", "named"]);
  });

  it("enabled 不参与先后顺序：停用的池照样能算出完整顺序", () => {
    const queued = [q("a1", "a", "2026-01-01T00:00:00Z"), q("b1", "b", "2026-01-01T00:00:01Z")];
    const result = dispatchOrder(limit({ enabled: false }), [], queued);
    expect(result.eligible).toEqual(["a1", "b1"]);
  });

  it("排序不看容量还剩几个空位：即便池已经满了，也能算出完整的公平顺序", () => {
    const queued = [q("a1", "a", "2026-01-01T00:00:00Z"), q("b1", "b", "2026-01-01T00:00:01Z")];
    const result = dispatchOrder(limit({ capacity: 0 }), [], queued);
    expect(result.eligible).toEqual(["a1", "b1"]);
  });
});
