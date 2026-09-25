import { API_PATHS } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProjectInfo, createStatsResponse, createTaskPage } from "./fixtures.js";
import { readJsonBody, startTestServer, type TestServer } from "./testServer.js";

/**
 * 三个只读新路由：/api/stats、/api/tasks、/api/projects。
 * 重点验证查询参数被 zod 解析后原样交给服务、非法参数 400。
 */
describe("GET /api/stats", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("把解析后的查询参数交给 service.stats，不需要令牌", async () => {
    const response = createStatsResponse({ dimension: "channel" });
    let received: unknown = null;
    server.service.stats = (query) => {
      received = query;
      return response;
    };

    const res = await fetch(`${server.baseUrl}${API_PATHS.stats}?range=30d&dimension=channel`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(response);
    expect(received).toEqual({ range: "30d", dimension: "channel" });
  });

  it("custom 缺日期时 400 invalid_request，消息取第一条问题", async () => {
    const res = await fetch(`${server.baseUrl}${API_PATHS.stats}?range=custom`);

    expect(res.status).toBe(400);
    const body = await readJsonBody(res);
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toContain("请求参数不对");
    // 只报第一条问题，不把多条问题串起来。
    expect(body.error.message).not.toContain("；");
  });

  it("dimension 不在枚举里时 400 invalid_request", async () => {
    const res = await fetch(`${server.baseUrl}${API_PATHS.stats}?dimension=foo`);

    expect(res.status).toBe(400);
    expect((await readJsonBody(res)).error.code).toBe("invalid_request");
  });
});

describe("GET /api/tasks", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("把解析后的查询参数交给 service.tasks，不需要令牌", async () => {
    const page = createTaskPage({ total: 3 });
    let received: unknown = null;
    server.service.tasks = (query) => {
      received = query;
      return page;
    };

    const res = await fetch(
      `${server.baseUrl}${API_PATHS.tasks}?status=running&sort=tokens&order=asc&limit=10`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(page);
    expect(received).toEqual({
      range: "all",
      status: "running",
      sort: "tokens",
      order: "asc",
      limit: 10,
    });
  });

  it("limit=0 时 400 invalid_request", async () => {
    const res = await fetch(`${server.baseUrl}${API_PATHS.tasks}?limit=0`);

    expect(res.status).toBe(400);
    expect((await readJsonBody(res)).error.code).toBe("invalid_request");
  });

  it("range=custom 缺日期时 400 invalid_request", async () => {
    const res = await fetch(`${server.baseUrl}${API_PATHS.tasks}?range=custom&from=2026-09-01`);

    expect(res.status).toBe(400);
    expect((await readJsonBody(res)).error.code).toBe("invalid_request");
  });
});

describe("GET /api/projects", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("直接透传 service.projects() 的结果，不需要令牌", async () => {
    const projects = [createProjectInfo({ key: "c:\\code\\demo" })];
    server.service.projects = () => projects;

    const res = await fetch(`${server.baseUrl}${API_PATHS.projects}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(projects);
  });
});
