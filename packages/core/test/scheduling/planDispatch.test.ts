import { describe, expect, it } from "vitest";
import type { RuntimeId } from "../../src/domain/status.js";
import type { PoolLimit, QueuedEntry, RunningEntry } from "../../src/scheduling/index.js";
import { planDispatch } from "../../src/scheduling/index.js";

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

/** 点名某个池的排队条目。 */
function q(
  runId: string,
  poolId: string,
  projectKey: string,
  queuedAt: string,
  runtime: RuntimeId = "pi",
): QueuedEntry {
  return { runId, requestedPoolId: poolId, runtime, projectKey, queuedAt };
}

/** 公共排队条目（没点名池）。 */
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

/** 排队时间用秒递增，方便断言先后。 */
function at(second: number): string {
  return `2026-01-01T00:00:${String(second).padStart(2, "0")}Z`;
}

describe("planDispatch", () => {
  it("例子 1：甲满、乙有空，公共排队全部进乙，超出的留着（M5 例子 1）", () => {
    const limits = [pool("甲", { capacity: 2 }), pool("乙", { capacity: 3 })];
    const running = [r("jia-run-0", "甲", "a"), r("jia-run-1", "甲", "a")];
    const queued = [0, 1, 2, 3].map((i) => shared(`s${i}`, "a", at(i)));

    const dispatched = planDispatch(limits, running, queued);

    // 甲在跑 2、容量 2，空位 0 被跳过；乙空位 3，接走最早的 3 个；第 4 个留在公共排队。
    expect(dispatched).toEqual([
      { runId: "s0", poolId: "乙" },
      { runId: "s1", poolId: "乙" },
      { runId: "s2", poolId: "乙" },
    ]);
  });

  it("例子 2：甲有 1 个空位，最早的 1 个进甲，其余进乙（M5 例子 2）", () => {
    const limits = [pool("甲", { capacity: 2 }), pool("乙", { capacity: 3 })];
    const running = [r("jia-run-0", "甲", "a")];
    const queued = [0, 1, 2, 3].map((i) => shared(`s${i}`, "a", at(i)));

    const dispatched = planDispatch(limits, running, queued);

    // 优先级高的甲先挑：空位 1，挑走排队最早的 s0；乙再接剩下的 3 个。
    expect(dispatched).toEqual([
      { runId: "s0", poolId: "甲" },
      { runId: "s1", poolId: "乙" },
      { runId: "s2", poolId: "乙" },
      { runId: "s3", poolId: "乙" },
    ]);
  });

  it("例子 3：甲停用但有 2 个空位，公共排队全部跳过甲（M5 例子 3）", () => {
    const limits = [pool("甲", { capacity: 2, enabled: false }), pool("乙", { capacity: 5 })];
    const queued = [0, 1].map((i) => shared(`s${i}`, "a", at(i)));

    const dispatched = planDispatch(limits, [], queued);

    expect(dispatched).toEqual([
      { runId: "s0", poolId: "乙" },
      { runId: "s1", poolId: "乙" },
    ]);
  });

  it("例子 4：点名甲的排队在甲满、乙有空时不会进乙（M5 例子 4）", () => {
    const limits = [pool("甲", { capacity: 1 }), pool("乙", { capacity: 5 })];
    const running = [r("jia-run-0", "甲", "a")];
    const queued = [q("named", "甲", "a", at(0))];

    const dispatched = planDispatch(limits, running, queued);

    // 点名甲就只等甲；甲满了它继续排队，不会被顺延到乙。
    expect(dispatched).toEqual([]);
  });

  it("例子 5：公共排队的运行时决定它能进哪个池（M5 例子 5）", () => {
    const limits = [
      pool("甲", { capacity: 5, runtimes: ["pi"] }),
      pool("乙", { capacity: 5, runtimes: ["opencode"] }),
    ];
    const queued = [shared("oc1", "a", at(0), "opencode")];

    const dispatched = planDispatch(limits, [], queued);

    // 甲只配了 pi，运行时是 opencode 的公共排队只有乙能接。
    expect(dispatched).toEqual([{ runId: "oc1", poolId: "乙" }]);
  });

  it("例子 6：甲只剩 1 个空位，点名甲的项目 A 排队、公共排队里项目 B 在甲占用少 → B 先放（M5 例子 6）", () => {
    const limits = [pool("甲", { capacity: 3 })];
    const running = [r("jia-a-0", "甲", "A"), r("jia-a-1", "甲", "A")];
    const queued = [q("a-q", "甲", "A", at(0)), shared("b-q", "B", at(1))];

    const dispatched = planDispatch(limits, running, queued);

    // A 在甲已占 2，B 占 0；空位 1，按第一版的公平规则给占得少的 B。
    expect(dispatched).toEqual([{ runId: "b-q", poolId: "甲" }]);
  });

  it("例子 7：续接（点名原池）在原池停用时不放行，重新启用后放行（M5 例子 7）", () => {
    const running: RunningEntry[] = [];
    const queued = [q("resume", "甲", "a", at(0))];

    const disabled = [pool("甲", { capacity: 5, enabled: false })];
    expect(planDispatch(disabled, running, queued)).toEqual([]);

    const enabled = [pool("甲", { capacity: 5, enabled: true })];
    expect(planDispatch(enabled, running, queued)).toEqual([{ runId: "resume", poolId: "甲" }]);
  });

  it("例子 8：第一版 12/8 的例子改成新类型后照旧通过（M5 例子 8）", () => {
    const limits = [pool("dsf", { capacity: 20 })];
    const running: RunningEntry[] = Array.from({ length: 12 }, (_, i) =>
      r(`jia-run-${i}`, "dsf", "甲"),
    );
    const queued: QueuedEntry[] = [
      ...Array.from({ length: 10 }, (_, i) =>
        shared(`jia-${i}`, "甲", `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        shared(`yi-${i}`, "乙", `2026-01-01T00:01:${String(i).padStart(2, "0")}Z`),
      ),
    ];

    const dispatched = planDispatch(limits, running, queued);

    expect(dispatched).toHaveLength(8);
    expect(dispatched).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ runId: `yi-${i}`, poolId: "dsf" })),
    );
  });

  it("容量上限：空位不够时只放行最前面的几个", () => {
    const limits = [pool("p1", { capacity: 5 })];
    const running = [r("run-1", "p1", "a"), r("run-2", "p1", "a"), r("run-3", "p1", "a")];
    const queued = [0, 1, 2, 3].map((i) => shared(`q${i}`, "a", at(i)));

    // 在跑 3，容量 5，空位只有 2 个。
    expect(planDispatch(limits, running, queued)).toEqual([
      { runId: "q0", poolId: "p1" },
      { runId: "q1", poolId: "p1" },
    ]);
  });

  it("容量 0 表示暂停放行：不放行任何排队", () => {
    const limits = [pool("p1", { capacity: 0 })];
    const queued = [shared("q1", "a", at(0))];

    expect(planDispatch(limits, [], queued)).toEqual([]);
  });

  it("容量被调小到低于在跑数时：不放行任何排队，直到占用回落", () => {
    const limits = [pool("p1", { capacity: 3 })];
    const running = Array.from({ length: 5 }, (_, i) => r(`run-${i}`, "p1", "a"));
    const queued = [shared("q1", "a", at(0))];

    expect(planDispatch(limits, running, queued)).toEqual([]);
  });

  it("多个池互不影响：结果按 limits 顺序（优先级）拼接", () => {
    const limits = [pool("p1", { capacity: 1 }), pool("p2", { capacity: 2 })];
    const queued = [
      q("p1-a", "p1", "a", at(0)),
      q("p1-b", "p1", "b", at(1)),
      q("p2-a", "p2", "a", at(0)),
      q("p2-b", "p2", "b", at(1)),
    ];

    expect(planDispatch(limits, [], queued)).toEqual([
      { runId: "p1-a", poolId: "p1" },
      { runId: "p2-a", poolId: "p2" },
      { runId: "p2-b", poolId: "p2" },
    ]);
  });

  it("点名了不存在（已删除）的池的排队条目被忽略", () => {
    const limits = [pool("p1", { capacity: 5 })];
    const queued = [
      q("q1", "p1", "a", at(0)),
      q("ghost", "removed-pool", "a", at(0)),
      shared("s1", "a", at(1)),
    ];

    // 点名已删除的池不参与任何放行；公共排队正常进 p1。
    expect(planDispatch(limits, [], queued)).toEqual([
      { runId: "q1", poolId: "p1" },
      { runId: "s1", poolId: "p1" },
    ]);
  });

  it("同一个公共排队的运行在一轮里只被分走一次：优先级高的池先挑", () => {
    const limits = [pool("甲", { capacity: 1 }), pool("乙", { capacity: 1 })];
    const queued = [shared("s0", "a", at(0)), shared("s1", "a", at(1))];

    const dispatched = planDispatch(limits, [], queued);

    expect(dispatched).toEqual([
      { runId: "s0", poolId: "甲" },
      { runId: "s1", poolId: "乙" },
    ]);
  });
});
