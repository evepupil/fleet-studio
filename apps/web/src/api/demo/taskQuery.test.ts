import { type TimeZone, tasksQuerySchema, type WorkerSummary } from "@fleet/core";
import { describe, expect, it } from "vitest";
import { buildDemoScenario } from "./scenarios";
import { demoSummaries } from "./scheduling";
import { queryDemoTasks } from "./taskQuery";

const TZ: TimeZone = { offsetMinutes: () => 480 };

const busy = buildDemoScenario("busy", TZ);
const NOW_MS = Date.parse(busy.snapshot.serverTime);
const summaries: readonly WorkerSummary[] = demoSummaries(
  busy.config,
  busy.workers,
  busy.runs,
  NOW_MS,
);

function query(input: Record<string, unknown>) {
  return queryDemoTasks(summaries, tasksQuerySchema.parse(input), NOW_MS, TZ);
}

describe("演示任务查询", () => {
  it("默认筛进行中：23 个在跑 + 7 个排队", () => {
    const page = query({});
    expect(page.total).toBe(30);
    expect(page.items.length).toBe(30);
    expect(page.nextCursor).toBeNull();
    for (const item of page.items) {
      expect(["running", "queued"]).toContain(item.status);
    }
  });

  it("status=all 给出全部，第一页 50 条、有下一页", () => {
    const page = query({ status: "all" });
    expect(page.total).toBe(806);
    expect(page.items.length).toBe(50);
    expect(page.nextCursor).toBe("50");
  });

  it("翻页：第二页接着第一页，游标到最后为 null", () => {
    const first = query({ status: "all", sort: "createdAt", order: "desc" });
    const second = query({
      status: "all",
      sort: "createdAt",
      order: "desc",
      cursor: first.nextCursor ?? "",
    });
    expect(second.items.length).toBe(50);
    const firstIds = new Set(first.items.map((item) => item.id));
    for (const item of second.items) {
      expect(firstIds.has(item.id)).toBe(false);
    }
    const last = query({ status: "all", limit: 100, cursor: "800" });
    expect(last.items.length).toBe(6);
    expect(last.nextCursor).toBeNull();
  });

  it("游标解不开时抛错", () => {
    expect(() => query({ status: "all", cursor: "abc" })).toThrow(
      "翻页参数无效，请从第一页重新加载",
    );
    expect(() => query({ status: "all", cursor: "-1" })).toThrow(
      "翻页参数无效，请从第一页重新加载",
    );
  });

  it("retrying 只给工作中且正在重试的", () => {
    const page = query({ status: "retrying" });
    expect(page.total).toBe(1);
    expect(page.items[0]?.id).toBe("wx2j3k");
    expect(page.items[0]?.retry).not.toBeNull();
  });

  it("单个状态筛选", () => {
    expect(query({ status: "running" }).total).toBe(23);
    expect(query({ status: "queued" }).total).toBe(7);
    expect(query({ status: "failed" }).total).toBeGreaterThan(0);
    expect(query({ status: "completed" }).total).toBeGreaterThan(0);
    expect(query({ status: "cancelled" }).total).toBeGreaterThan(0);
  });

  it("按项目、池、角色、渠道、模型筛选", () => {
    const wiki = query({ status: "all", project: "c:\\code\\wiki-forge" });
    expect(wiki.total).toBeGreaterThan(0);
    for (const item of wiki.items) {
      expect(item.projectKey).toBe("c:\\code\\wiki-forge");
    }
    const dsf = query({ status: "all", pool: "dsf" });
    expect(dsf.total).toBeGreaterThan(0);
    for (const item of dsf.items) {
      expect(item.poolId).toBe("dsf");
    }
    const reviewers = query({ status: "all", role: "reviewer" });
    expect(reviewers.total).toBeGreaterThan(0);
    for (const item of reviewers.items) {
      expect(item.role).toBe("reviewer");
    }
    const mcgrox = query({ status: "all", channel: "mcgrox" });
    expect(mcgrox.total).toBeGreaterThan(0);
    for (const item of mcgrox.items) {
      expect(item.channel).toBe("mcgrox");
    }
    const model = query({ status: "all", model: "gpt-6-luna" });
    expect(model.total).toBeGreaterThan(0);
    for (const item of model.items) {
      expect(item.modelName).toBe("gpt-6-luna");
    }
  });

  it("标题搜索不区分大小写，唯一标题命中 1 条", () => {
    expect(query({ status: "all", q: "Fake 后端" }).total).toBe(1);
    expect(query({ status: "all", q: "fake 后端" }).total).toBe(1);
    expect(query({ status: "all", q: "评审第二版调度改动" }).total).toBe(1);
    expect(query({ status: "all", q: "不存在的标题" }).total).toBe(0);
  });

  it("时间范围按创建时间筛", () => {
    const today = query({ status: "all", range: "today" });
    expect(today.total).toBeGreaterThan(0);
    for (const item of today.items) {
      expect(Date.parse(item.createdAt)).toBeGreaterThanOrEqual(NOW_MS - 12 * 60 * 60 * 1000);
    }
    const all = query({ status: "all" });
    expect(today.total).toBeLessThan(all.total);
    const custom = query({ status: "all", range: "custom", from: "2026-09-23", to: "2026-09-23" });
    expect(custom.total).toBe(today.total);
  });

  it("排序：用量、耗时、创建时间，同值按编号同向", () => {
    const byTokens = query({ status: "all", sort: "tokens", order: "desc" });
    for (let index = 1; index < byTokens.items.length; index += 1) {
      const previous = byTokens.items[index - 1];
      const current = byTokens.items[index];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (previous === undefined || current === undefined) {
        continue;
      }
      expect(previous.usage.totalTokens).toBeGreaterThanOrEqual(current.usage.totalTokens);
    }
    const byRunMs = query({ status: "all", sort: "runMs", order: "asc" });
    for (let index = 1; index < byRunMs.items.length; index += 1) {
      const previous = byRunMs.items[index - 1];
      const current = byRunMs.items[index];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (previous === undefined || current === undefined) {
        continue;
      }
      expect(previous.runMs).toBeLessThanOrEqual(current.runMs);
    }
    const byCreated = query({ status: "all", sort: "createdAt", order: "desc" });
    for (let index = 1; index < byCreated.items.length; index += 1) {
      const previous = byCreated.items[index - 1];
      const current = byCreated.items[index];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (previous === undefined || current === undefined) {
        continue;
      }
      expect(Date.parse(previous.createdAt)).toBeGreaterThanOrEqual(Date.parse(current.createdAt));
    }
  });

  it("翻页时每页不重不漏", () => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    for (;;) {
      const page = query({ status: "all", limit: 100, ...(cursor === null ? {} : { cursor }) });
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      pages += 1;
      cursor = page.nextCursor;
      if (cursor === null) {
        break;
      }
      expect(pages).toBeLessThan(20);
    }
    expect(seen.size).toBe(806);
  });
});
