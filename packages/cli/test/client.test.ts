import { TOKEN_HEADER } from "@fleet/core";
import { afterEach, describe, expect, it } from "vitest";
import { createFleetClient, FleetApiError } from "../src/client.js";
import { CliConnectionError } from "../src/errors.js";
import { type StubServer, startStubServer } from "./support/stubServer.js";

let stub: StubServer | undefined;

afterEach(async () => {
  await stub?.close();
  stub = undefined;
});

describe("FleetClient", () => {
  it("getJson 不带令牌，原样解析出响应 JSON", async () => {
    stub = await startStubServer(() => ({ status: 200, body: { hello: "world" } }));
    const client = createFleetClient(stub.baseUrl, "unused-token");

    const result = await client.getJson<{ hello: string }>("/api/whatever", { a: 1, b: undefined });
    expect(result).toEqual({ hello: "world" });

    const request = stub.requests[0];
    expect(request?.method).toBe("GET");
    expect(request?.path).toBe("/api/whatever");
    expect(request?.query.get("a")).toBe("1");
    expect(request?.query.has("b")).toBe(false);
    expect(request?.headers[TOKEN_HEADER]).toBeUndefined();
  });

  it("postJson 带令牌和 JSON 请求体", async () => {
    stub = await startStubServer(() => ({ status: 201, body: { ok: true } }));
    const client = createFleetClient(stub.baseUrl, "secret-token");

    await client.postJson("/api/workers", { prompt: "写代码" });

    const request = stub.requests[0];
    expect(request?.method).toBe("POST");
    expect(request?.headers[TOKEN_HEADER]).toBe("secret-token");
    expect(request?.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(request?.body ?? "{}")).toEqual({ prompt: "写代码" });
  });

  it("patchJson 带令牌", async () => {
    stub = await startStubServer(() => ({ status: 200, body: { id: "dsf" } }));
    const client = createFleetClient(stub.baseUrl, "secret-token");
    await client.patchJson("/api/pools/dsf", { capacity: 10 });
    expect(stub.requests[0]?.method).toBe("PATCH");
    expect(stub.requests[0]?.headers[TOKEN_HEADER]).toBe("secret-token");
  });

  it("postEmpty 带令牌但没有请求体", async () => {
    stub = await startStubServer(() => ({ status: 200, body: { ok: true } }));
    const client = createFleetClient(stub.baseUrl, "secret-token");
    await client.postEmpty("/api/workers/w1/cancel");
    const request = stub.requests[0];
    expect(request?.method).toBe("POST");
    expect(request?.body).toBe("");
    expect(request?.headers[TOKEN_HEADER]).toBe("secret-token");
  });

  it("服务回结构化错误时抛 FleetApiError，带上错误码和中文说明", async () => {
    stub = await startStubServer(() => ({
      status: 404,
      body: { error: { code: "not_found", message: "苦工不存在" } },
    }));
    const client = createFleetClient(stub.baseUrl, "token");

    await expect(client.getJson("/api/workers/nope")).rejects.toMatchObject({
      code: "not_found",
      message: "苦工不存在",
    });
    await expect(client.getJson("/api/workers/nope")).rejects.toBeInstanceOf(FleetApiError);
  });

  it("响应不是合法的 ApiErrorBody 时抛 CliConnectionError", async () => {
    stub = await startStubServer(() => ({ status: 500, body: "<html>oops</html>" }));
    const client = createFleetClient(stub.baseUrl, "token");
    await expect(client.getJson("/api/whatever")).rejects.toBeInstanceOf(CliConnectionError);
  });

  it("连不上服务时抛 CliConnectionError", async () => {
    // 起一个桩服务拿到一个刚刚监听过的端口，关掉之后这个端口应该没人listen，用来模拟连不上。
    const closedStub = await startStubServer(() => ({ status: 200 }));
    const deadUrl = closedStub.baseUrl;
    await closedStub.close();

    const client = createFleetClient(deadUrl, "token");
    await expect(client.getJson("/api/health")).rejects.toBeInstanceOf(CliConnectionError);
  });
});
