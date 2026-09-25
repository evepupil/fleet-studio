import { describe, expect, it } from "vitest";
import { createDemoDataSource } from "./demoSource";

describe("演示数据源", () => {
  it("reorderPools 后快照池顺序跟着变", async () => {
    const source = createDemoDataSource("busy");
    const views = await source.reorderPools(["luna", "qwen27", "glmf", "dsf"]);
    expect(views.map((pool) => pool.id)).toEqual(["luna", "qwen27", "glmf", "dsf"]);
    expect(views.map((pool) => pool.priority)).toEqual([1, 2, 3, 4]);
    const seen: string[][] = [];
    const unsubscribe = source.subscribeSnapshot(
      (snapshot) => {
        seen.push(snapshot.pools.map((pool) => pool.id));
      },
      () => undefined,
    );
    expect(seen[0]).toEqual(["luna", "qwen27", "glmf", "dsf"]);
    unsubscribe();
  });

  it("传错的排列抛错，池顺序不变", async () => {
    const source = createDemoDataSource("busy");
    await expect(source.reorderPools(["dsf", "glmf", "qwen27"])).rejects.toThrow(
      "池的列表已经变了，请刷新后再调顺序",
    );
    await expect(source.reorderPools(["dsf", "glmf", "qwen27", "luna", "dsf"])).rejects.toThrow(
      "池的列表已经变了，请刷新后再调顺序",
    );
    const projects = await source.getProjects();
    expect(projects.length).toBe(6);
  });

  it("setPoolEnabled 后订阅者收到新快照", async () => {
    const source = createDemoDataSource("busy");
    const seen: { id: string; enabled: boolean }[][] = [];
    const unsubscribe = source.subscribeSnapshot(
      (snapshot) => {
        seen.push(snapshot.pools.map((pool) => ({ id: pool.id, enabled: pool.enabled })));
      },
      () => undefined,
    );
    const view = await source.setPoolEnabled("dsf", false);
    expect(view.enabled).toBe(false);
    expect(seen).toHaveLength(2);
    expect(seen[1]?.find((pool) => pool.id === "dsf")?.enabled).toBe(false);
    unsubscribe();
  });

  it("池不存在时抛错", async () => {
    const source = createDemoDataSource("busy");
    await expect(source.setPoolEnabled("nope", false)).rejects.toThrow("池不存在：nope");
  });

  it("offline 先报 open，300 毫秒后报 lost", async () => {
    const source = createDemoDataSource("offline");
    const states: string[] = [];
    source.subscribeSnapshot(
      () => undefined,
      (state) => {
        states.push(state);
      },
    );
    expect(states).toEqual(["open"]);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(states).toEqual(["open", "lost"]);
  });

  it("fixedNow 是固定的 DEMO_NOW，详情和时间线都取得到", () => {
    const source = createDemoDataSource("busy");
    expect(source.fixedNow()).toBe(Date.parse("2026-09-23T04:10:00.000Z"));
    const seen: string[] = [];
    source.subscribeWorker("wr8v2k", -1, {
      onDetail: () => seen.push("detail"),
      onEvents: (events) => seen.push(`events:${events.length}`),
      onNotFound: () => seen.push("notFound"),
      onError: () => seen.push("error"),
    });
    expect(seen).toEqual(["detail", "events:27"]);
    const missing: string[] = [];
    source.subscribeWorker("nope", -1, {
      onDetail: () => missing.push("detail"),
      onEvents: () => missing.push("events"),
      onNotFound: () => missing.push("notFound"),
      onError: () => missing.push("error"),
    });
    expect(missing).toEqual(["notFound"]);
  });
});
