import { API_PATHS } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSnapshot } from "./fixtures.js";
import { startTestServer, type TestServer } from "./testServer.js";

describe("GET /api/snapshot", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("直接透传 service.snapshot() 的结果，不需要令牌", async () => {
    const snapshot = createSnapshot({ version: "9.9.9" });
    server.service.snapshot = () => snapshot;

    const res = await fetch(`${server.baseUrl}${API_PATHS.snapshot}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(snapshot);
  });
});
