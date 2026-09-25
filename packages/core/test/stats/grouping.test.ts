import { describe, expect, it } from "vitest";
import type { RunFact, WorkerFact } from "../../src/stats/index.js";
import {
  addTask,
  ensureGroup,
  type Group,
  type GroupMapKey,
  groupRuns,
  MISSING_GROUP_KEY,
  rankGroups,
  type ScopedRun,
  UNKNOWN_KEY,
} from "../../src/stats/index.js";

/**
 * grouping.ts 的单测：分组累加器的归组规则、以及前 N 名 + 「其他」的合成。
 * 这里直接造 ScopedRun，不走 computeStats，好把注意力放在累加器本身。
 */

const BASE_MS = Date.parse("2026-09-25T00:00:00Z");

function worker(workerId: string, overrides: Partial<WorkerFact> = {}): WorkerFact {
  return {
    workerId,
    createdAt: new Date(BASE_MS).toISOString(),
    projectKey: "p1",
    role: "r1",
    channel: "cA",
    modelName: "m1",
    ...overrides,
  };
}

function scoped(
  runId: string,
  workerId: string,
  tokens: number,
  startedAtMs = BASE_MS,
  ms = 100,
): ScopedRun {
  const run: RunFact = {
    runId,
    workerId,
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: null,
    runMs: ms,
    inputTokens: tokens,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: tokens,
    costUsd: 0,
  };
  return { run, startedMs: startedAtMs, ms };
}

function workerMap(workers: readonly WorkerFact[]): Map<string, WorkerFact> {
  return new Map(workers.map((current) => [current.workerId, current] as const));
}

/** 每段一小时的两个分段起点 */
const TWO_BUCKETS: readonly number[] = [BASE_MS, BASE_MS + 3_600_000];

describe("groupRuns", () => {
  it("按分组键聚合 tokens / runMs / tasks", () => {
    const workers = [worker("w1"), worker("w2"), worker("w3")];
    const groups = groupRuns(
      [scoped("r1", "w1", 10), scoped("r2", "w2", 5), scoped("r3", "w3", 7)],
      workerMap(workers),
      (current) => current.projectKey,
      TWO_BUCKETS,
      true,
    );
    expect(groups.size).toBe(1);
    const group = groups.get("p1");
    expect(group?.tokens).toBe(22);
    expect(group?.runMs).toBe(300);
    expect(group?.taskCount).toBe(3);
  });

  it("同一个任务的多次运行只算一个 task，但 tokens / runMs 累加", () => {
    const groups = groupRuns(
      [scoped("r1", "w1", 10), scoped("r2", "w1", 5)],
      workerMap([worker("w1")]),
      (current) => current.projectKey,
      TWO_BUCKETS,
      true,
    );
    const group = groups.get("p1");
    expect(group?.taskCount).toBe(1);
    expect(group?.tokens).toBe(15);
    expect(group?.runMs).toBe(200);
  });

  it("分组键为 null 时归到 unknown", () => {
    const groups = groupRuns(
      [scoped("r1", "w1", 10)],
      workerMap([worker("w1", { modelName: null })]),
      (current) => current.modelName,
      TWO_BUCKETS,
      true,
    );
    expect([...groups.keys()]).toEqual([MISSING_GROUP_KEY]);
    expect(groups.get(MISSING_GROUP_KEY)?.key).toBe(UNKNOWN_KEY);
    expect(groups.get(MISSING_GROUP_KEY)?.isMissing).toBe(true);
    expect(groups.get(MISSING_GROUP_KEY)?.tokens).toBe(10);
  });

  it("真实叫 unknown 的分组和缺失值分成两组，不合并", () => {
    // w1 的模型真叫 "unknown"，w2 取不到模型名（null）。两者对外 key 都是 "unknown"，
    // 但内部必须分开：前者是真实数据，后者是数据缺失。
    const groups = groupRuns(
      [scoped("r1", "w1", 10), scoped("r2", "w2", 5)],
      workerMap([worker("w1", { modelName: "unknown" }), worker("w2", { modelName: null })]),
      (current) => current.modelName,
      TWO_BUCKETS,
      true,
    );
    expect(groups.size).toBe(2);
    expect(groups.get("unknown")?.tokens).toBe(10);
    expect(groups.get("unknown")?.isMissing).toBe(false);
    expect(groups.get(MISSING_GROUP_KEY)?.tokens).toBe(5);
    expect(groups.get(MISSING_GROUP_KEY)?.isMissing).toBe(true);
  });

  it("找不到任务事实的运行跳过", () => {
    const groups = groupRuns(
      [scoped("r1", "ghost", 10), scoped("r2", "w1", 5)],
      workerMap([worker("w1")]),
      (current) => current.projectKey,
      TWO_BUCKETS,
      true,
    );
    expect(groups.get("p1")?.tokens).toBe(5);
    expect(groups.get("p1")?.taskCount).toBe(1);
  });

  it("countRunsAsTasks 为 false 时不记 tasks", () => {
    const groups = groupRuns(
      [scoped("r1", "w1", 10)],
      workerMap([worker("w1")]),
      (current) => current.projectKey,
      TWO_BUCKETS,
      false,
    );
    expect(groups.get("p1")?.taskCount).toBe(0);
    expect(groups.get("p1")?.tokens).toBe(10);
  });

  it("按开跑时刻把 tokens 归到对应分段", () => {
    const groups = groupRuns(
      [scoped("r1", "w1", 10, BASE_MS), scoped("r2", "w1", 4, BASE_MS + 3_600_000)],
      workerMap([worker("w1")]),
      (current) => current.projectKey,
      TWO_BUCKETS,
      true,
    );
    expect(groups.get("p1")?.points).toEqual([10, 4]);
  });

  it("早于第一段的运行不计入任何分段，但 tokens 仍累加", () => {
    const groups = groupRuns(
      [scoped("r1", "w1", 10, BASE_MS - 60_000)],
      workerMap([worker("w1")]),
      (current) => current.projectKey,
      TWO_BUCKETS,
      true,
    );
    expect(groups.get("p1")?.points).toEqual([0, 0]);
    expect(groups.get("p1")?.tokens).toBe(10);
  });

  it("没有分段时 points 为空数组，不报错", () => {
    const groups = groupRuns(
      [scoped("r1", "w1", 10)],
      workerMap([worker("w1")]),
      (current) => current.projectKey,
      [],
      true,
    );
    expect(groups.get("p1")?.points).toEqual([]);
    expect(groups.get("p1")?.tokens).toBe(10);
  });

  it("空输入得到空 map", () => {
    expect(
      groupRuns([], workerMap([]), (current) => current.projectKey, TWO_BUCKETS, true).size,
    ).toBe(0);
  });
});

describe("ensureGroup", () => {
  it("同一个 key 复用同一个累加器", () => {
    const groups = new Map<GroupMapKey, Group>();
    const first = ensureGroup(groups, "p1", 2);
    first.tokens += 5;
    const second = ensureGroup(groups, "p1", 2);
    expect(second).toBe(first);
    expect(second.tokens).toBe(5);
    expect(groups.size).toBe(1);
  });

  it("新累加器初始化为零，points 长度等于分段数", () => {
    const group = ensureGroup(new Map(), "p1", 3);
    expect(group.isOther).toBe(false);
    expect(group.isMissing).toBe(false);
    expect(group.tokens).toBe(0);
    expect(group.runMs).toBe(0);
    expect(group.taskCount).toBe(0);
    expect(group.seenTasks.size).toBe(0);
    expect(group.points).toEqual([0, 0, 0]);
  });
});

describe("rankGroups", () => {
  /** 按 [key, tokens] 造分组；tasks 自动给一个 task-<key>，points 是 [tokens, 0] */
  function makeGroups(weights: readonly [string, number][]): Group[] {
    const groups = new Map<GroupMapKey, Group>();
    for (const [key, tokens] of weights) {
      const group = ensureGroup(groups, key, 2);
      group.tokens = tokens;
      group.runMs = tokens * 10;
      addTask(group, `task-${key}`);
      group.points = [tokens, 0];
    }
    return [...groups.values()];
  }

  /** 造 n 项，权重依次为 1..n（即 key k0 最小） */
  function descending(n: number): Group[] {
    return makeGroups(Array.from({ length: n }, (_, index) => [`k${index}`, index + 1]));
  }

  it("不足 8 项时按权重降序返回，没有「其他」", () => {
    const result = rankGroups(
      makeGroups([
        ["a", 1],
        ["b", 3],
      ]),
      (group) => group.tokens,
      2,
    );
    expect(result.map((group) => group.key)).toEqual(["b", "a"]);
    expect(result.some((group) => group.isOther)).toBe(false);
  });

  it("正好 8 项时不合并", () => {
    const result = rankGroups(descending(8), (group) => group.tokens, 2);
    expect(result.length).toBe(8);
    expect(result.some((group) => group.isOther)).toBe(false);
    expect(result[0]?.key).toBe("k7");
  });

  it("超过 8 项时保留前 8 名，其余合成「其他」", () => {
    const result = rankGroups(descending(10), (group) => group.tokens, 2);
    expect(result.length).toBe(9);
    expect(result.slice(0, 8).map((group) => group.key)).toEqual([
      "k9",
      "k8",
      "k7",
      "k6",
      "k5",
      "k4",
      "k3",
      "k2",
    ]);
    const other = result[8];
    expect(other?.key).toBe("");
    expect(other?.isOther).toBe(true);
    // 其余是 k0(1) 和 k1(2)
    expect(other?.tokens).toBe(3);
    expect(other?.runMs).toBe(30);
    expect(other?.points).toEqual([3, 0]);
    expect(other?.taskCount).toBe(2);
  });

  it("「其他」的 tasks 是各项相加（不去重）", () => {
    const groups = descending(10);
    // k0、k1 会进「其他」；让它们记同一个 taskId，按规格相加得 2 而不是 1。
    const k0 = groups.find((group) => group.key === "k0") as Group;
    const k1 = groups.find((group) => group.key === "k1") as Group;
    addTask(k0, "shared");
    addTask(k1, "shared");
    const other = rankGroups(groups, (group) => group.tokens, 2)[8];
    // k0、k1 各自本来有 1 个任务，各再加 1 个 shared，相加得 4（若去重会是 3）。
    expect(other?.taskCount).toBe(4);
  });

  it("权重相同时保持原顺序", () => {
    const result = rankGroups(
      makeGroups(Array.from({ length: 10 }, (_, index) => [`k${index}`, 5])),
      (group) => group.tokens,
      2,
    );
    expect(result.slice(0, 8).map((group) => group.key)).toEqual([
      "k0",
      "k1",
      "k2",
      "k3",
      "k4",
      "k5",
      "k6",
      "k7",
    ]);
    expect(result[8]?.key).toBe("");
  });

  it("不改动传入的分组数组", () => {
    const groups = descending(3);
    rankGroups(groups, (group) => group.tokens, 2);
    expect(groups.map((group) => group.key)).toEqual(["k0", "k1", "k2"]);
  });

  it("空输入返回空数组", () => {
    expect(rankGroups([], (group) => group.tokens, 2)).toEqual([]);
  });
});
