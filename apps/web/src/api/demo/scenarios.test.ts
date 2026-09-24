import type { PoolView } from "@fleet/core";
import { describe, expect, it } from "vitest";
import { formatTokens } from "../../lib/format";
import { WIKI } from "./records";
import { buildDemoScenario, DEMO_SCENARIOS } from "./scenarios";

/**
 * 锁定演示数据里交互检查要断言的数字（见 design/工作区.md「交互检查会找什么」）。
 * 改演示数据时这里会先红，提醒同步改交互检查的期望值。
 */
describe("演示场景 busy", () => {
  const scenario = buildDemoScenario("busy");
  const dsf = scenario.snapshot.pools.find((pool) => pool.id === "dsf");
  const glm = scenario.snapshot.pools.find((pool) => pool.id === "glm");

  it("容量：dsf 18/20、排队 4、1 格在重试；glm 3/8", () => {
    expect(dsf?.running).toBe(18);
    expect(dsf?.capacity).toBe(20);
    expect(dsf?.queued).toBe(4);
    expect(dsf?.slots).toHaveLength(18);
    expect(dsf?.slots.filter((slot) => slot.retrying)).toHaveLength(1);
    expect(glm?.running).toBe(3);
    expect(glm?.capacity).toBe(8);
    expect(glm?.queued).toBe(0);
  });

  it("容量格按项目成段：wiki-forge 的 11 格排在最前", () => {
    const first = dsf?.slots.slice(0, 11) ?? [];
    expect(first.every((slot) => slot.projectKey === WIKI.key)).toBe(true);
    expect(dsf?.slots[11]?.projectKey).not.toBe(WIKI.key);
  });

  it("dsf 的 4 个排队苦工拿到 1~4 的排队位置", () => {
    const positions = scenario.snapshot.workers
      .filter((worker) => worker.status === "queued" && worker.poolId === "dsf")
      .map((worker) => worker.queuePosition)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(positions).toEqual([1, 2, 3, 4]);
  });

  it("wk3m7p 是工作中的「类目配置校验：数值与区间参数」", () => {
    const worker = scenario.snapshot.workers.find((item) => item.id === "wk3m7p");
    expect(worker?.title).toBe("类目配置校验：数值与区间参数");
    expect(worker?.status).toBe("running");
  });

  it("wr8v2k：两次运行、27 条事件、最新回报为通过且有五段", () => {
    const detail = scenario.details.get("wr8v2k");
    const timeline = scenario.timelines.get("wr8v2k") ?? [];
    expect(detail?.runs).toHaveLength(2);
    expect(detail?.summary.verdict).toBe("pass");
    expect(detail?.runs[1]?.report?.sections.map((section) => section.key)).toEqual([
      "SUMMARY",
      "FILES",
      "VERIFY",
      "VERDICT",
      "ISSUES",
    ]);
    expect(timeline).toHaveLength(27);
    expect(timeline.map((event) => event.seq)).toEqual(timeline.map((_, index) => index));
    expect(timeline.filter((event) => event.kind === "tool_call")).toHaveLength(8);
    expect(timeline.filter((event) => event.kind === "run_start")).toHaveLength(2);
    expect(timeline.filter((event) => event.kind === "run_end")).toHaveLength(2);
  });

  it("今日用量拆分：dsf 输入 1.1M · 输出 480.4K · 缓存 672.6K；glm 输入 93.6K · 输出 40.1K · 缓存 56.2K", () => {
    // 交互检查第 13 条按这两行文字断言；缓存只算缓存读，和苦工详情的用量写法一致
    const breakdown = (pool: PoolView | undefined): string | null =>
      pool === undefined
        ? null
        : `输入 ${formatTokens(pool.usageToday.inputTokens)} · 输出 ${formatTokens(pool.usageToday.outputTokens)} · 缓存 ${formatTokens(pool.usageToday.cacheReadTokens)}`;
    expect(breakdown(dsf)).toBe("输入 1.1M · 输出 480.4K · 缓存 672.6K");
    expect(breakdown(glm)).toBe("输入 93.6K · 输出 40.1K · 缓存 56.2K");
  });

  it("每个快照里的苦工都有详情和时间线", () => {
    for (const worker of scenario.snapshot.workers) {
      expect(scenario.details.has(worker.id)).toBe(true);
      expect(scenario.timelines.has(worker.id)).toBe(true);
    }
  });

  it("项目计数与苦工列表一致", () => {
    for (const project of scenario.snapshot.projects) {
      const workers = scenario.snapshot.workers.filter(
        (worker) => worker.projectKey === project.key,
      );
      const total = Object.values(project.counts).reduce((sum, count) => sum + count, 0);
      expect(total).toBe(workers.length);
    }
  });
});

describe("其余演示场景", () => {
  it("failure：dsf 10 分钟内失败 9、6 个在重试、配置文件有错", () => {
    const { snapshot } = buildDemoScenario("failure");
    const dsf = snapshot.pools.find((pool) => pool.id === "dsf");
    expect(dsf?.health.failed).toBe(9);
    expect(dsf?.health.retrying).toBe(6);
    expect(dsf?.queued).toBe(10);
    expect(snapshot.configError).not.toBeNull();
  });

  it("empty：没有任何苦工和项目", () => {
    const { snapshot } = buildDemoScenario("empty");
    expect(snapshot.workers).toHaveLength(0);
    expect(snapshot.projects).toHaveLength(0);
    expect(snapshot.pools).toHaveLength(2);
  });

  it("offline：连接最终断开，数据同 busy", () => {
    const offline = buildDemoScenario("offline");
    expect(offline.connection).toBe("lost");
    expect(offline.snapshot.workers).toHaveLength(
      buildDemoScenario("busy").snapshot.workers.length,
    );
  });

  it("场景清单完整", () => {
    expect([...DEMO_SCENARIOS]).toEqual(["busy", "empty", "failure", "offline"]);
  });
});
