import type { TimeZone, WorkerSummary } from "@fleet/core";
import { describe, expect, it } from "vitest";
import { buildDemoScenario } from "../api/demo/scenarios";
import {
  boardLayout,
  type CollapsibleColumn,
  cardMeta,
  filterBoardWorkers,
  groupBoardColumns,
} from "./board";

/**
 * 看板的分列、排序、筛选和卡片进度小片。演示数据的数字写死在这里，
 * 交互检查（scripts/ui/probe.mjs）的期望值从这里抄。时区固定 +480。
 */
const TZ: TimeZone = { offsetMinutes: () => 480 };
const busy = buildDemoScenario("busy", TZ).snapshot;
const failure = buildDemoScenario("failure", TZ).snapshot;
const NO_FILTER = { q: "" };

function ids(workers: readonly WorkerSummary[]): string[] {
  return workers.map((worker) => worker.id);
}

function worker(patch: Partial<WorkerSummary>): WorkerSummary {
  const base = busy.workers[0];
  if (base === undefined) throw new Error("演示数据为空");
  return { ...base, ...patch };
}

describe("boardLayout", () => {
  it("默认展开排队中、工作中、已完成，失败和已取消收在右侧", () => {
    expect(boardLayout(new Set())).toEqual({
      columns: ["queued", "running", "completed"],
      collapsed: ["failed", "cancelled"],
    });
  });

  it("展开的列按固定顺序插在已完成后面，收起组随之变少", () => {
    const expanded = new Set<CollapsibleColumn>(["cancelled"]);
    expect(boardLayout(expanded)).toEqual({
      columns: ["queued", "running", "completed", "cancelled"],
      collapsed: ["failed"],
    });
    expect(boardLayout(new Set<CollapsibleColumn>(["cancelled", "failed"]))).toEqual({
      columns: ["queued", "running", "completed", "failed", "cancelled"],
      collapsed: [],
    });
  });
});

describe("groupBoardColumns（演示场景 busy）", () => {
  const columns = groupBoardColumns(busy.workers);

  it("五列数量：排队 7、工作中 23、已完成 46、失败 5、已取消 6", () => {
    expect(columns.queued).toHaveLength(7);
    expect(columns.running).toHaveLength(23);
    expect(columns.completed).toHaveLength(46);
    expect(columns.failed).toHaveLength(5);
    expect(columns.cancelled).toHaveLength(6);
  });

  it("排队中按位次交错：各队第 1 位在前，同位次点名的在公共排队前", () => {
    expect(ids(columns.queued)).toEqual([
      "wq6e7f",
      "wq2v5w",
      "wm6p9t",
      "wp9u4v",
      "wn7q2u",
      "wn8t3u",
      "wp8r3v",
    ]);
  });

  it("工作中最近开跑的在前，已结束的三列最近结束的在前", () => {
    expect(ids(columns.running).slice(0, 3)).toEqual(["wk5n8s", "we8g3m", "wz2q3r"]);
    expect(ids(columns.running).at(-1)).toBe("wq2a3b");
    expect(ids(columns.completed).slice(0, 3)).toEqual(["wr8v2k", "ws9w4x", "wq7f8g"]);
    expect(ids(columns.failed).slice(0, 2)).toEqual(["wx4m5n", "wu3y6z"]);
    expect(ids(columns.cancelled)[0]).toBe("wv4z7a");
  });
});

describe("groupBoardColumns（演示场景 failure）", () => {
  it("五列数量：排队 10、工作中 7、已完成 38、失败 12、已取消 4", () => {
    const columns = groupBoardColumns(failure.workers);
    expect(columns.queued).toHaveLength(10);
    expect(columns.running).toHaveLength(7);
    expect(columns.completed).toHaveLength(38);
    expect(columns.failed).toHaveLength(12);
    expect(columns.cancelled).toHaveLength(4);
  });
});

describe("filterBoardWorkers", () => {
  it("按项目筛 wiki-forge：排队 4、工作中 11、已完成 12、失败 1、已取消 1", () => {
    const columns = groupBoardColumns(
      filterBoardWorkers(busy.workers, { ...NO_FILTER, project: "c:\\code\\wiki-forge" }),
    );
    expect(columns.queued).toHaveLength(4);
    expect(columns.running).toHaveLength(11);
    expect(columns.completed).toHaveLength(12);
    expect(columns.failed).toHaveLength(1);
    expect(columns.cancelled).toHaveLength(1);
  });

  it("按池 glmf 筛只剩 glmf 上的任务", () => {
    const filtered = filterBoardWorkers(busy.workers, { ...NO_FILTER, pool: "glmf" });
    expect(filtered.every((item) => item.poolId === "glmf")).toBe(true);
    expect(groupBoardColumns(filtered).running).toHaveLength(4);
  });

  it("角色、渠道、模型按精确值筛", () => {
    const reviewers = filterBoardWorkers(busy.workers, { ...NO_FILTER, role: "reviewer" });
    expect(reviewers.length).toBeGreaterThan(0);
    expect(reviewers.every((item) => item.role === "reviewer")).toBe(true);
    const luna = filterBoardWorkers(busy.workers, { ...NO_FILTER, model: "gpt-6-luna" });
    expect(luna.every((item) => item.modelName === "gpt-6-luna")).toBe(true);
    const snow = filterBoardWorkers(busy.workers, { ...NO_FILTER, channel: "snow" });
    expect(snow.every((item) => item.channel === "snow")).toBe(true);
  });

  it("标题不区分大小写包含匹配，首尾空白忽略", () => {
    expect(ids(filterBoardWorkers(busy.workers, { q: "  fake 后端 " }))).toEqual(["wx2j3k"]);
    expect(filterBoardWorkers(busy.workers, { q: "没有这个标题" })).toEqual([]);
  });

  it("没有条件时原样返回全部", () => {
    expect(filterBoardWorkers(busy.workers, NO_FILTER)).toHaveLength(87);
  });
});

describe("cardMeta", () => {
  it("排队：点名的写「排队第 N 位」，公共排队写「公共排队第 N 位」", () => {
    const byId = new Map(busy.workers.map((item) => [item.id, item] as const));
    const named = byId.get("wp8r3v");
    const shared = byId.get("wn8t3u");
    if (named === undefined || shared === undefined) throw new Error("演示数据缺任务");
    expect(cardMeta(named)).toEqual({ kind: "queue", text: "排队第 4 位" });
    expect(cardMeta(shared)).toEqual({ kind: "queue", text: "公共排队第 3 位" });
  });

  it("工作中：重试时写「重试 N/M」，否则从开跑时刻实时走", () => {
    const retrying = busy.workers.find((item) => item.id === "wx2j3k");
    const running = busy.workers.find((item) => item.id === "wk5n8s");
    if (retrying === undefined || running === undefined) throw new Error("演示数据缺任务");
    expect(cardMeta(retrying)).toEqual({ kind: "retry", text: "重试 3/8" });
    expect(cardMeta(running)).toEqual({ kind: "elapsed", from: running.startedAt });
  });

  it("已完成、已取消给在跑总时长；失败给原因；缺数据时不出小片", () => {
    expect(cardMeta(worker({ status: "completed", runMs: 570000 }))).toEqual({
      kind: "duration",
      ms: 570000,
    });
    expect(cardMeta(worker({ status: "cancelled", runMs: 0 }))).toBeNull();
    expect(cardMeta(worker({ status: "failed", failReason: "timeout" }))).toEqual({
      kind: "failure",
      text: "运行超时",
    });
    expect(cardMeta(worker({ status: "failed", failReason: null }))).toBeNull();
    expect(cardMeta(worker({ status: "queued", queuePosition: null }))).toBeNull();
    expect(cardMeta(worker({ status: "running", retry: null, startedAt: null }))).toBeNull();
  });
});
