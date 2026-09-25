import { API_PATHS, FleetError } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPoolView } from "./fixtures.js";
import { readJsonBody, startTestServer, type TestServer } from "./testServer.js";

/**
 * PUT /api/pools/:id/enabled 和 PUT /api/pools/order：看板仅有的两个写权限，
 * 命令行令牌和看板令牌都可以；其余写接口看板令牌一律 401。
 */
describe("PUT /api/pools/:id/enabled", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("命令行令牌：请求体校验后透传给 service.setPoolEnabled", async () => {
    const pool = createPoolView({ id: "gpu", enabled: false });
    server.service.setPoolEnabled = async (id, enabled) => {
      expect(id).toBe("gpu");
      expect(enabled).toBe(false);
      return pool;
    };

    const res = await server.fetchWithToken(API_PATHS.poolEnabled("gpu"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(pool);
  });

  it("看板令牌也能调，返回 200", async () => {
    const pool = createPoolView({ id: "gpu", enabled: true });
    server.service.setPoolEnabled = async () => pool;

    const res = await server.fetchWithDashboardToken(API_PATHS.poolEnabled("gpu"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(pool);
  });

  it("不带令牌时 401 unauthorized", async () => {
    const res = await fetch(`${server.baseUrl}${API_PATHS.poolEnabled("gpu")}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });

    expect(res.status).toBe(401);
    expect((await readJsonBody(res)).error.code).toBe("unauthorized");
  });

  it("请求体不是布尔时 400 invalid_request", async () => {
    const res = await server.fetchWithToken(API_PATHS.poolEnabled("gpu"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: "yes" }),
    });

    expect(res.status).toBe(400);
    expect((await readJsonBody(res)).error.code).toBe("invalid_request");
  });

  it("服务抛 conflict 时 409", async () => {
    server.service.setPoolEnabled = async () => {
      throw new FleetError("conflict", "配置在别处被改过");
    };

    const res = await server.fetchWithToken(API_PATHS.poolEnabled("gpu"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });

    expect(res.status).toBe(409);
    expect((await readJsonBody(res)).error.code).toBe("conflict");
  });

  it("服务抛 not_found 时 404", async () => {
    server.service.setPoolEnabled = async () => {
      throw new FleetError("not_found", "池不存在");
    };

    const res = await server.fetchWithToken(API_PATHS.poolEnabled("nope"), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });

    expect(res.status).toBe(404);
    expect((await readJsonBody(res)).error.code).toBe("not_found");
  });
});

describe("PUT /api/pools/order", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("命令行令牌：请求体校验后透传给 service.reorderPools", async () => {
    const pools = [createPoolView({ id: "gpu" }), createPoolView({ id: "default" })];
    server.service.reorderPools = async (poolIds) => {
      expect(poolIds).toEqual(["gpu", "default"]);
      return pools;
    };

    const res = await server.fetchWithToken(API_PATHS.poolOrder, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ poolIds: ["gpu", "default"] }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(pools);
  });

  it("看板令牌也能调，返回 200", async () => {
    server.service.reorderPools = async () => [createPoolView()];

    const res = await server.fetchWithDashboardToken(API_PATHS.poolOrder, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ poolIds: ["default"] }),
    });

    expect(res.status).toBe(200);
  });

  it("不带令牌时 401 unauthorized", async () => {
    const res = await fetch(`${server.baseUrl}${API_PATHS.poolOrder}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ poolIds: ["default"] }),
    });

    expect(res.status).toBe(401);
    expect((await readJsonBody(res)).error.code).toBe("unauthorized");
  });

  it("poolIds 为空时 400 invalid_request", async () => {
    const res = await server.fetchWithToken(API_PATHS.poolOrder, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ poolIds: [] }),
    });

    expect(res.status).toBe(400);
    expect((await readJsonBody(res)).error.code).toBe("invalid_request");
  });

  it("服务抛 conflict 时 409（poolIds 不是全部池的一个排列）", async () => {
    server.service.reorderPools = async () => {
      throw new FleetError("conflict", "不是全部池的排列");
    };

    const res = await server.fetchWithToken(API_PATHS.poolOrder, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ poolIds: ["gpu"] }),
    });

    expect(res.status).toBe(409);
    expect((await readJsonBody(res)).error.code).toBe("conflict");
  });

  it("非 JSON 内容类型时 400 invalid_request", async () => {
    const res = await server.fetchWithToken(API_PATHS.poolOrder, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ poolIds: ["default"] }),
    });

    expect(res.status).toBe(400);
    expect((await readJsonBody(res)).error.code).toBe("invalid_request");
  });
});

describe("看板令牌的权限边界", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("看板令牌调 POST /api/workers 是 401", async () => {
    const res = await server.fetchWithDashboardToken(API_PATHS.workers, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectPath: "C:\\demo", cwd: "C:\\demo", prompt: "干活" }),
    });

    expect(res.status).toBe(401);
    expect((await readJsonBody(res)).error.code).toBe("unauthorized");
  });

  it("看板令牌调 PATCH /api/pools/:id 是 401", async () => {
    const res = await server.fetchWithDashboardToken(API_PATHS.pool("default"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capacity: 10 }),
    });

    expect(res.status).toBe(401);
  });

  it("看板令牌调 POST /api/shutdown 是 401", async () => {
    const res = await server.fetchWithDashboardToken(API_PATHS.shutdown, { method: "POST" });

    expect(res.status).toBe(401);
    expect(server.service.requestShutdown).not.toHaveBeenCalled();
  });
});
