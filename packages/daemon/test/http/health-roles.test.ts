import { API_PATHS } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHealth, createRoleView } from "./fixtures.js";
import { startTestServer, type TestServer } from "./testServer.js";

describe("GET /api/health", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("直接透传 service.health() 的结果，不需要令牌", async () => {
    const health = createHealth({ pid: 999, port: server.port });
    server.service.health = () => health;

    const res = await fetch(`${server.baseUrl}${API_PATHS.health}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(health);
  });
});

describe("GET /api/roles", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("直接透传 service.roles() 的结果，不需要令牌", async () => {
    const roles = [createRoleView({ id: "review", label: "评审" })];
    server.service.roles = () => roles;

    const res = await fetch(`${server.baseUrl}${API_PATHS.roles}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(roles);
  });
});
