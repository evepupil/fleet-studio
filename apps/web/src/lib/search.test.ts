import type { TimeZone, WorkerSummary } from "@fleet/core";
import { describe, expect, it } from "vitest";
import { buildDemoScenario } from "../api/demo/scenarios";
import { matchLiveTasks, mergeSearchResults, SEARCH_LIMIT } from "./search";

const TZ: TimeZone = { offsetMinutes: () => 480 };
const busy = buildDemoScenario("busy", TZ).snapshot;

function ids(workers: readonly WorkerSummary[]): string[] {
  return workers.map((worker) => worker.id);
}

describe("matchLiveTasks", () => {
  it("关键词为空时给最近创建的 8 个", () => {
    const recent = matchLiveTasks(busy.workers, "   ");
    expect(recent).toHaveLength(SEARCH_LIMIT);
    expect(ids(recent).slice(0, 3)).toEqual(["wp8r3v", "wq6e7f", "wn8t3u"]);
  });

  it("编号完全相同排第一，编号前缀其次，标题包含最后", () => {
    expect(ids(matchLiveTasks(busy.workers, "WR8V2K"))).toEqual(["wr8v2k"]);
    const prefixed = matchLiveTasks(busy.workers, "wq");
    expect(prefixed.every((item) => item.id.startsWith("wq"))).toBe(true);
    expect(ids(prefixed)[0]).toBe("wq6e7f");
  });

  it("标题不区分大小写包含匹配", () => {
    expect(ids(matchLiveTasks(busy.workers, "fake 后端"))).toEqual(["wx2j3k"]);
    expect(matchLiveTasks(busy.workers, "没有这个标题")).toEqual([]);
  });

  it("最多返回 limit 条", () => {
    expect(matchLiveTasks(busy.workers, "评审", 3)).toHaveLength(3);
  });
});

describe("mergeSearchResults", () => {
  it("快照结果在前，接口结果去重补在后面，最多 8 条", () => {
    const [a, b, c] = busy.workers;
    if (a === undefined || b === undefined || c === undefined) throw new Error("演示数据为空");
    expect(ids(mergeSearchResults([a, b], [b, c]))).toEqual([a.id, b.id, c.id]);
    const many = busy.workers.slice(0, 20);
    expect(mergeSearchResults(many.slice(0, 5), many.slice(3))).toHaveLength(SEARCH_LIMIT);
  });
});
