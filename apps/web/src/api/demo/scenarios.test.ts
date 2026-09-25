import { computeStats, type TimeZone, tasksQuerySchema } from "@fleet/core";
import { describe, expect, it } from "vitest";
import { demoStatsLabels, runFactsOf, workerFactsOf } from "./facts";
import { buildDemoScenario, DEMO_SCENARIOS } from "./scenarios";
import { demoSummaries } from "./scheduling";
import { queryDemoTasks } from "./taskQuery";

/**
 * 锁定演示数据里交互检查要断言的数字（见 design/演示数据.md 第 6 节）。
 * 单测一律用固定 +480 的时区；改演示数据时这里会先红，提醒同步改交互检查的期望值。
 */
const TZ: TimeZone = { offsetMinutes: () => 480 };

const busy = buildDemoScenario("busy", TZ);
const NOW_MS = Date.parse(busy.snapshot.serverTime);

describe("演示场景 busy", () => {
  const live = busy.snapshot.live;

  it("实时五个数：占用 23 / 40、工作中 23、排队中 7、重试中 1", () => {
    expect(live.slotsUsed).toBe(23);
    expect(live.slotsTotal).toBe(40);
    expect(live.running).toBe(23);
    expect(live.queued).toBe(7);
    expect(live.retrying).toBe(1);
  });

  it("公共排队 3 个", () => {
    expect(busy.snapshot.sharedQueued).toBe(3);
  });

  it("四个池：dsf 18/20 排队 4、glmf 4/7、qwen27 0/5、luna 1/8", () => {
    const pools = new Map(busy.snapshot.pools.map((pool) => [pool.id, pool] as const));
    expect(busy.snapshot.pools.map((pool) => pool.id)).toEqual(["dsf", "glmf", "qwen27", "luna"]);
    expect(pools.get("dsf")?.running).toBe(18);
    expect(pools.get("dsf")?.capacity).toBe(20);
    expect(pools.get("dsf")?.queued).toBe(4);
    expect(pools.get("glmf")?.running).toBe(4);
    expect(pools.get("glmf")?.capacity).toBe(7);
    expect(pools.get("glmf")?.queued).toBe(0);
    expect(pools.get("qwen27")?.running).toBe(0);
    expect(pools.get("qwen27")?.capacity).toBe(5);
    expect(pools.get("luna")?.running).toBe(1);
    expect(pools.get("luna")?.capacity).toBe(8);
  });

  it("在跑格子里重试的个数是 1", () => {
    const retrying = busy.snapshot.pools.flatMap((pool) =>
      pool.slots.filter((slot) => slot.retrying),
    );
    expect(retrying).toHaveLength(1);
    expect(retrying[0]?.workerId).toBe("wx2j3k");
  });

  it("快照里进行中的苦工 30 个（23 在跑 + 7 排队）", () => {
    const active = busy.snapshot.workers.filter(
      (worker) => worker.status === "running" || worker.status === "queued",
    );
    expect(active).toHaveLength(30);
    expect(active.filter((worker) => worker.status === "running")).toHaveLength(23);
    expect(active.filter((worker) => worker.status === "queued")).toHaveLength(7);
  });

  it("记录总数固定：在跑那批 42 个 + 历史 764 个 = 806", () => {
    expect(busy.workers).toHaveLength(806);
    // 在跑那批 42 个苦工共 43 次运行（wr8v2k 有两次），历史 864 次
    expect(busy.runs).toHaveLength(864 + 43);
    // 24 小时窗口内的历史只留一部分进快照，剩下的仍在 details 里
    expect(busy.snapshot.workers).toHaveLength(87);
  });

  it("容量格按项目成段：wiki-forge 的 11 格排在最前", () => {
    const dsf = busy.snapshot.pools.find((pool) => pool.id === "dsf");
    const first = dsf?.slots.slice(0, 11) ?? [];
    expect(first.every((slot) => slot.projectKey === "c:\\code\\wiki-forge")).toBe(true);
    expect(dsf?.slots[11]?.projectKey).not.toBe("c:\\code\\wiki-forge");
  });

  it("dsf 的 4 个点名排队苦工拿到 1~4 的排队位置", () => {
    const positions = busy.snapshot.workers
      .filter((worker) => worker.status === "queued" && worker.poolId === "dsf")
      .map((worker) => worker.queuePosition)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(positions).toEqual([1, 2, 3, 4]);
  });

  it("公共排队的 3 个按排队时间先后编号", () => {
    const shared = busy.snapshot.workers
      .filter((worker) => worker.status === "queued" && worker.poolId === null)
      .sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
    expect(shared.map((worker) => worker.id)).toEqual(["wq2v5w", "wp9u4v", "wn8t3u"]);
    expect(shared.map((worker) => worker.queuePosition)).toEqual([1, 2, 3]);
  });

  it("wk3m7p 是工作中的「类目配置校验：数值与区间参数」", () => {
    const worker = busy.snapshot.workers.find((item) => item.id === "wk3m7p");
    expect(worker?.title).toBe("类目配置校验：数值与区间参数");
    expect(worker?.status).toBe("running");
  });

  it("第一版 5 个苦工的编号、标题和回报原样保留", () => {
    const titles: Readonly<Record<string, string>> = {
      wr8v2k: "评审 M0 核心层改动",
      wk3m7p: "类目配置校验：数值与区间参数",
      wx2j3k: "Fake 后端：取消的上下文检查",
      wu3y6z: "中继服务令牌校验",
      wy3p4q: "侦察：竞品站信息结构",
    };
    for (const [id, title] of Object.entries(titles)) {
      const worker = busy.workers.find((item) => item.id === id);
      expect(worker?.title).toBe(title);
    }
    const detail = busy.details.get("wr8v2k");
    expect(detail?.summary.verdict).toBe("pass");
    expect(detail?.runs[1]?.report?.sections.map((section) => section.key)).toEqual([
      "SUMMARY",
      "FILES",
      "VERIFY",
      "VERDICT",
      "ISSUES",
    ]);
  });

  it("wr8v2k：两次运行、27 条事件、8 次工具调用", () => {
    const detail = busy.details.get("wr8v2k");
    const timeline = busy.timelines.get("wr8v2k") ?? [];
    expect(detail?.runs).toHaveLength(2);
    expect(timeline).toHaveLength(27);
    expect(timeline.filter((event) => event.kind === "tool_call")).toHaveLength(8);
    expect(timeline.filter((event) => event.kind === "run_start")).toHaveLength(2);
    expect(timeline.filter((event) => event.kind === "run_end")).toHaveLength(2);
  });

  it("只有第一版那 5 个运行有事件，其余苦工的时间线是空的", () => {
    const withEvents = [...busy.timelines.entries()].filter(([, events]) => events.length > 0);
    expect(withEvents.map(([id]) => id).sort()).toEqual(
      ["wk3m7p", "wr8v2k", "wu3y6z", "wx2j3k"].sort(),
    );
  });

  it("每个苦工都有详情和时间线", () => {
    expect(busy.details.size).toBe(busy.workers.length);
    expect(busy.timelines.size).toBe(busy.workers.length);
  });

  it("项目计数与快照苦工列表一致", () => {
    for (const project of busy.snapshot.projects) {
      const workers = busy.snapshot.workers.filter((worker) => worker.projectKey === project.key);
      const total = Object.values(project.counts).reduce((sum, count) => sum + count, 0);
      expect(total).toBe(workers.length);
    }
  });
});

describe("演示场景 busy 的统计（固定 +480）", () => {
  const facts = {
    runs: runFactsOf(busy.runs),
    workers: workerFactsOf(busy.workers),
    labels: demoStatsLabels(busy.projects, busy.config),
  };

  it("range=all：任务 806 个、token 463,165,596、今天 61 个", () => {
    const stats = computeStats({
      range: { kind: "all" },
      dimension: "model",
      nowMs: NOW_MS,
      tz: TZ,
      ...facts,
    });
    expect(stats.total.tasks).toBe(806);
    expect(stats.total.usage.totalTokens).toBe(463_165_596);
    expect(stats.today.tasks).toBe(61);
  });

  it("四个维度下 tokenShare 的项数：模型 4、渠道 4、项目 6、角色 6", () => {
    const countOf = (dimension: "model" | "channel" | "project" | "role"): number =>
      computeStats({ range: { kind: "all" }, dimension, nowMs: NOW_MS, tz: TZ, ...facts })
        .tokenShare.length;
    expect(countOf("model")).toBe(4);
    expect(countOf("channel")).toBe(4);
    expect(countOf("project")).toBe(6);
    expect(countOf("role")).toBe(6);
  });

  it("range=today：按小时分段、13 段；range=7d：按天分段、7 段", () => {
    const today = computeStats({
      range: { kind: "today" },
      dimension: "model",
      nowMs: NOW_MS,
      tz: TZ,
      ...facts,
    });
    expect(today.granularity).toBe("hour");
    expect(today.buckets).toHaveLength(13);
    const week = computeStats({
      range: { kind: "7d" },
      dimension: "model",
      nowMs: NOW_MS,
      tz: TZ,
      ...facts,
    });
    expect(week.granularity).toBe("day");
    expect(week.buckets).toHaveLength(7);
  });
});

describe("演示场景 busy 的任务查询", () => {
  const summaries = demoSummaries(busy.config, busy.workers, busy.runs, NOW_MS);

  it("默认筛进行中：30 条，一页装得下", () => {
    const page = queryDemoTasks(summaries, tasksQuerySchema.parse({}), NOW_MS, TZ);
    expect(page.total).toBe(30);
    expect(page.items).toHaveLength(30);
    expect(page.nextCursor).toBeNull();
  });

  it("status=all：806 条，第一页 50 条、还有下一页", () => {
    const page = queryDemoTasks(summaries, tasksQuerySchema.parse({ status: "all" }), NOW_MS, TZ);
    expect(page.total).toBe(806);
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).toBe("50");
  });

  it("按唯一标题搜「Fake 后端」命中 1 条", () => {
    const page = queryDemoTasks(
      summaries,
      tasksQuerySchema.parse({ status: "all", q: "Fake 后端" }),
      NOW_MS,
      TZ,
    );
    expect(page.total).toBe(1);
    expect(page.items[0]?.id).toBe("wx2j3k");
  });
});

describe("其余演示场景", () => {
  it("failure：dsf 10 分钟内失败 9、6 个在重试、配置文件有错", () => {
    const { snapshot } = buildDemoScenario("failure", TZ);
    const dsf = snapshot.pools.find((pool) => pool.id === "dsf");
    expect(dsf?.health.failed).toBe(9);
    expect(dsf?.health.retrying).toBe(6);
    expect(dsf?.queued).toBe(10);
    expect(snapshot.configError).not.toBeNull();
  });

  it("failure 的实时数：占用 7 / 40、工作中 7、排队中 10、重试中 6", () => {
    const { snapshot } = buildDemoScenario("failure", TZ);
    expect(snapshot.live.slotsUsed).toBe(7);
    expect(snapshot.live.slotsTotal).toBe(40);
    expect(snapshot.live.running).toBe(7);
    expect(snapshot.live.queued).toBe(10);
    expect(snapshot.live.retrying).toBe(6);
    expect(snapshot.sharedQueued).toBe(0);
    const pools = new Map(snapshot.pools.map((pool) => [pool.id, pool] as const));
    expect(pools.get("dsf")?.running).toBe(6);
    expect(pools.get("dsf")?.queued).toBe(10);
    expect(pools.get("glmf")?.running).toBe(1);
    expect(pools.get("glmf")?.queued).toBe(0);
  });

  it("empty：没有苦工和项目，实时数全 0，统计为空", () => {
    const empty = buildDemoScenario("empty", TZ);
    expect(empty.snapshot.workers).toHaveLength(0);
    expect(empty.snapshot.projects).toHaveLength(0);
    expect(empty.workers).toHaveLength(0);
    expect(empty.snapshot.live.slotsUsed).toBe(0);
    expect(empty.snapshot.live.running).toBe(0);
    expect(empty.snapshot.live.queued).toBe(0);
    expect(empty.snapshot.live.retrying).toBe(0);
    // 池还在（配置同 busy），所以可用容量还是 40，只是没有东西在跑
    expect(empty.snapshot.live.slotsTotal).toBe(40);
    expect(empty.snapshot.sharedQueued).toBe(0);
    const stats = computeStats({
      range: { kind: "all" },
      dimension: "model",
      nowMs: NOW_MS,
      tz: TZ,
      runs: runFactsOf(empty.runs),
      workers: workerFactsOf(empty.workers),
      labels: demoStatsLabels(empty.projects, empty.config),
    });
    expect(stats.total.tasks).toBe(0);
    expect(stats.buckets).toHaveLength(0);
  });

  it("disabled：四个池全停用、可用容量 0、公共排队 5 个", () => {
    const { snapshot } = buildDemoScenario("disabled", TZ);
    expect(snapshot.pools).toHaveLength(4);
    expect(snapshot.pools.every((pool) => !pool.enabled)).toBe(true);
    expect(snapshot.live.slotsTotal).toBe(0);
    expect(snapshot.live.slotsUsed).toBe(23);
    expect(snapshot.live.running).toBe(23);
    expect(snapshot.live.queued).toBe(9);
    expect(snapshot.live.retrying).toBe(1);
    expect(snapshot.sharedQueued).toBe(5);
  });

  it("offline：连接最终断开，数据同 busy", () => {
    const offline = buildDemoScenario("offline", TZ);
    expect(offline.connection).toBe("lost");
    expect(offline.snapshot.workers).toHaveLength(busy.snapshot.workers.length);
  });

  it("场景清单完整", () => {
    expect([...DEMO_SCENARIOS]).toEqual(["busy", "empty", "failure", "offline", "disabled"]);
  });
});
