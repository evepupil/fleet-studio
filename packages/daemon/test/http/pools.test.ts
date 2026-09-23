import { API_PATHS } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPoolView } from "./fixtures.js";
import { readJsonBody, startTestServer, type TestServer } from "./testServer.js";

describe("GET /api/pools", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("直接透传 service.pools() 的结果，不需要令牌", async () => {
    const pools = [createPoolView({ id: "gpu", capacity: 5 })];
    server.service.pools = () => pools;

    const res = await fetch(`${server.baseUrl}${API_PATHS.pools}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(pools);
  });
});

describe("PATCH /api/pools/:id", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("成功路径：请求体按 poolPatchSchema 校验后透传", async () => {
    const pool = createPoolView({ id: "default", capacity: 30 });
    server.service.patchPool = async (id, patch) => {
      expect(id).toBe("default");
      expect(patch).toEqual({ capacity: 30 });
      return pool;
    };

    const res = await server.fetchWithToken(API_PATHS.pool("default"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capacity: 30 }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(pool);
  });

  it("请求体一项都没改时 400 invalid_request（poolPatchSchema 的 refine 规则）", async () => {
    const res = await server.fetchWithToken(API_PATHS.pool("default"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    expect((await readJsonBody(res)).error.code).toBe("invalid_request");
  });

  it("缺令牌时 401 unauthorized", async () => {
    const res = await fetch(`${server.baseUrl}${API_PATHS.pool("default")}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capacity: 10 }),
    });

    expect(res.status).toBe(401);
  });
});
