import { API_PATHS } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pollUntil } from "./pollUntil.js";
import { startTestServer, type TestServer } from "./testServer.js";

describe("POST /api/shutdown", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("先返回 { ok: true }，响应发出之后才调用 service.requestShutdown()", async () => {
    let shutdownCalled = false;
    server.service.requestShutdown = () => {
      shutdownCalled = true;
    };

    const res = await server.fetchWithToken(API_PATHS.shutdown, { method: "POST" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // 响应体已经读完，服务端这时应该已经把响应写完；requestShutdown 最迟也应该在很短时间内被调用。
    await pollUntil(() => shutdownCalled, 1000);
    expect(shutdownCalled).toBe(true);
  });
});
