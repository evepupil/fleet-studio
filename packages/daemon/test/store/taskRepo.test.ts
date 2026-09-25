import { describe, expect, it } from "vitest";
import { createRepos } from "../../src/store/index.js";
import { addTask, taskQuery } from "./taskRepo.helpers.js";

describe("taskRepo", () => {
  it("按最新一次运行判定 all、active、retrying 和具体状态", () => {
    const repos = createRepos(":memory:");
    addTask(repos, { id: "queued", status: "queued" });
    addTask(repos, { id: "running", status: "running" });
    addTask(repos, {
      id: "retrying",
      status: "running",
      runs: [{ retry: { attempt: 1, max: 3, message: "稍后重试" } }],
    });
    addTask(repos, { id: "completed", status: "completed" });
    addTask(repos, { id: "failed", status: "failed" });
    addTask(repos, { id: "cancelled", status: "cancelled" });

    const ids = (status: "all" | "active" | "retrying" | "queued" | "running" | "failed") =>
      repos.tasks
        .query(taskQuery({ status }))
        .workers.map((worker) => worker.id)
        .sort();
    expect(ids("all")).toEqual([
      "cancelled",
      "completed",
      "failed",
      "queued",
      "retrying",
      "running",
    ]);
    expect(ids("active")).toEqual(["queued", "retrying", "running"]);
    expect(ids("retrying")).toEqual(["retrying"]);
    expect(ids("queued")).toEqual(["queued"]);
    expect(ids("running")).toEqual(["retrying", "running"]);
    expect(ids("failed")).toEqual(["failed"]);
    repos.close();
  });

  it("项目、池、角色、创建时间和转义后的标题条件共同筛选", () => {
    const repos = createRepos(":memory:");
    addTask(repos, {
      id: "match",
      projectKey: "p-one",
      poolId: "pool-a",
      role: "reviewer",
      createdAt: "2026-01-02T00:00:00.000Z",
      title: "Build 100%_done \\ draft",
    });
    addTask(repos, {
      id: "wildcards-are-literal",
      projectKey: "p-one",
      poolId: "pool-a",
      role: "reviewer",
      createdAt: "2026-01-02T00:00:00.000Z",
      title: "Build 100XXdone draft",
    });
    addTask(repos, {
      id: "public",
      projectKey: "p-one",
      poolId: null,
      role: "reviewer",
      createdAt: "2026-01-02T00:00:00.000Z",
      title: "Build 100%_done public",
    });
    addTask(repos, {
      id: "other-project",
      projectKey: "p-two",
      poolId: "pool-a",
      role: "reviewer",
      createdAt: "2026-01-02T00:00:00.000Z",
      title: "Build 100%_done",
    });
    addTask(repos, {
      id: "too-early",
      projectKey: "p-one",
      poolId: "pool-a",
      role: "reviewer",
      createdAt: "2026-01-01T23:59:59.999Z",
      title: "Build 100%_done",
    });

    const query = (overrides: Parameters<typeof taskQuery>[0]) =>
      repos.tasks.query(
        taskQuery({
          projectKey: "p-one",
          poolId: "pool-a",
          role: "reviewer",
          createdFrom: "2026-01-02T00:00:00.000Z",
          createdTo: "2026-01-03T00:00:00.000Z",
          ...overrides,
        }),
      );
    expect(query({ titleContains: "%_" }).workers.map((worker) => worker.id)).toEqual(["match"]);
    expect(query({ titleContains: "\\" }).workers.map((worker) => worker.id)).toEqual(["match"]);
    expect(query({ titleContains: "100" }).workers.map((worker) => worker.id)).toEqual([
      "wildcards-are-literal",
      "match",
    ]);
    expect(repos.tasks.query(taskQuery({ poolId: "pool-a" })).workers).toHaveLength(4);
    expect(
      repos.tasks.query(taskQuery({ projectKey: "p-one", role: "reviewer" })).workers,
    ).toHaveLength(4);
    repos.close();
  });

  it("channel 条件按 workers.channel 精确筛选", () => {
    const repos = createRepos(":memory:");
    addTask(repos, { id: "channel-match" });
    addTask(repos, { id: "channel-other" });
    repos.workers.update("channel-match", { channel: "provider-a" });
    repos.workers.update("channel-other", { channel: "provider-b" });

    expect(
      repos.tasks.query(taskQuery({ channel: "provider-a" })).workers.map((worker) => worker.id),
    ).toEqual(["channel-match"]);
    repos.close();
  });

  it("modelName 条件按 workers.model_name 精确筛选", () => {
    const repos = createRepos(":memory:");
    addTask(repos, { id: "model-match" });
    addTask(repos, { id: "model-other" });
    repos.workers.update("model-match", { modelName: "model-a" });
    repos.workers.update("model-other", { modelName: "model-b" });

    expect(
      repos.tasks.query(taskQuery({ modelName: "model-a" })).workers.map((worker) => worker.id),
    ).toEqual(["model-match"]);
    repos.close();
  });

  it("三种排序的升降序都按排序值和编号稳定排列", () => {
    const repos = createRepos(":memory:");
    addTask(repos, {
      id: "a",
      createdAt: "2026-01-01T00:00:00.000Z",
      runs: [
        {
          runMs: 5,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 3,
            costUsd: null,
          },
        },
        {
          runMs: 5,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 4,
            costUsd: null,
          },
        },
      ],
    });
    addTask(repos, {
      id: "b",
      createdAt: "2026-01-02T00:00:00.000Z",
      runs: [
        {
          runMs: 10,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 7,
            costUsd: null,
          },
        },
      ],
    });
    addTask(repos, {
      id: "c",
      createdAt: "2026-01-03T00:00:00.000Z",
      runs: [
        {
          runMs: 30,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 1,
            costUsd: null,
          },
        },
      ],
    });
    addTask(repos, {
      id: "d",
      createdAt: "2026-01-04T00:00:00.000Z",
      runs: [
        {
          runMs: null,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            totalTokens: 0,
            costUsd: null,
          },
        },
      ],
    });

    const sorted = (sort: "createdAt" | "runMs" | "tokens", order: "asc" | "desc") =>
      repos.tasks.query(taskQuery({ sort, order })).workers.map((worker) => worker.id);
    expect(sorted("createdAt", "asc")).toEqual(["a", "b", "c", "d"]);
    expect(sorted("createdAt", "desc")).toEqual(["d", "c", "b", "a"]);
    expect(sorted("runMs", "asc")).toEqual(["d", "a", "b", "c"]);
    expect(sorted("runMs", "desc")).toEqual(["c", "b", "a", "d"]);
    expect(sorted("tokens", "asc")).toEqual(["d", "c", "a", "b"]);
    expect(sorted("tokens", "desc")).toEqual(["b", "a", "c", "d"]);
    repos.close();
  });

  it("三种排序两个方向完整翻页不重不漏，游标外新插入项不影响后续页", () => {
    const repos = createRepos(":memory:");
    for (let index = 0; index < 7; index += 1) {
      addTask(repos, {
        id: `w${index}`,
        createdAt: `2026-01-0${index + 1}T00:00:00.000Z`,
        runs: [
          {
            runMs: index * 10,
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              totalTokens: index % 3,
              costUsd: null,
            },
          },
        ],
      });
    }

    for (const sort of ["createdAt", "runMs", "tokens"] as const) {
      for (const order of ["asc", "desc"] as const) {
        const expected = repos.tasks
          .query(taskQuery({ sort, order, limit: 100 }))
          .workers.map((worker) => worker.id);
        const actual: string[] = [];
        let cursor: string | undefined;
        let pageCount = 0;
        do {
          const page = repos.tasks.query(
            taskQuery({ sort, order, limit: 2, ...(cursor === undefined ? {} : { cursor }) }),
          );
          expect(page.total).toBe(7);
          actual.push(...page.workers.map((worker) => worker.id));
          cursor = page.nextCursor ?? undefined;
          pageCount += 1;
          expect(pageCount).toBeLessThan(10);
        } while (cursor !== undefined);
        expect(actual).toEqual(expected);
        expect(new Set(actual).size).toBe(7);
      }
    }

    const first = repos.tasks.query(taskQuery({ sort: "createdAt", order: "desc", limit: 2 }));
    addTask(repos, { id: "inserted-newest", createdAt: "2026-02-01T00:00:00.000Z" });
    const cursor = first.nextCursor;
    if (cursor === null) throw new Error("预期第一页有下一页游标");
    const continued = repos.tasks.query(
      taskQuery({ sort: "createdAt", order: "desc", limit: 2, cursor }),
    );
    expect(continued.total).toBe(8);
    expect(continued.workers.map((worker) => worker.id)).not.toContain("inserted-newest");
    expect(continued.workers.map((worker) => worker.id)).not.toContain(first.workers[0]?.id);
    repos.close();
  });

  it("坏游标和排序键不匹配的游标抛统一请求错误", () => {
    const repos = createRepos(":memory:");
    addTask(repos, { id: "a" });
    addTask(repos, { id: "b" });
    const first = repos.tasks.query(taskQuery({ limit: 1 }));
    expect(() => repos.tasks.query(taskQuery({ cursor: "!!!" }))).toThrow(
      "翻页参数无效，请从第一页重新加载",
    );
    const cursor = first.nextCursor;
    if (cursor === null) throw new Error("预期第一页有下一页游标");
    expect(() => repos.tasks.query(taskQuery({ sort: "tokens", cursor }))).toThrow(
      "翻页参数无效，请从第一页重新加载",
    );
    repos.close();
  });
});
