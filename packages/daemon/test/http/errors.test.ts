import { API_PATHS, FleetError } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readJsonBody, startTestServer, type TestServer } from "./testServer.js";

describe("/api/* 未命中的路径", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("GET 未定义的 /api/ 路径返回 404 not_found", async () => {
    const res = await fetch(`${server.baseUrl}/api/does-not-exist`);

    expect(res.status).toBe(404);
    const body = await readJsonBody(res);
    expect(body.error.code).toBe("not_found");
  });

  it("POST 未定义的 /api/ 路径也返回 404 not_found（任意方法）", async () => {
    const res = await fetch(`${server.baseUrl}/api/does-not-exist`, { method: "POST" });

    expect(res.status).toBe(404);
    expect((await readJsonBody(res)).error.code).toBe("not_found");
  });
});

describe("错误码到状态码的映射", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("illegal_transition 映射成 409", async () => {
    server.service.cancel = async () => {
      throw new FleetError("illegal_transition", "状态不允许这样流转");
    };

    const res = await server.fetchWithToken(API_PATHS.workerCancel("wabc23"), { method: "POST" });

    expect(res.status).toBe(409);
    expect((await readJsonBody(res)).error.code).toBe("illegal_transition");
  });

  it("config_invalid 映射成 500", async () => {
    server.service.patchPool = async () => {
      throw new FleetError("config_invalid", "配置不合法");
    };

    const res = await server.fetchWithToken(API_PATHS.pool("default"), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capacity: 10 }),
    });

    expect(res.status).toBe(500);
    expect((await readJsonBody(res)).error.code).toBe("config_invalid");
  });

  it("pool_disabled 映射成 409", async () => {
    server.service.submit = async () => {
      throw new FleetError("pool_disabled", "点名的池已停用");
    };

    const res = await server.fetchWithToken(API_PATHS.workers, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectPath: "C:\\demo", cwd: "C:\\demo", prompt: "干活" }),
    });

    expect(res.status).toBe(409);
    expect((await readJsonBody(res)).error.code).toBe("pool_disabled");
  });

  it("非 FleetError 异常一律 500 internal，且只回通用说明，不泄露堆栈", async () => {
    server.service.pools = () => {
      throw new Error("这是一段不该被返回给客户端的内部堆栈信息");
    };

    const res = await fetch(`${server.baseUrl}${API_PATHS.pools}`);

    expect(res.status).toBe(500);
    const body = await readJsonBody(res);
    expect(body.error.code).toBe("internal");
    expect(body.error.message).toBe("服务内部错误");
    expect(body.error.message).not.toContain("不该被返回");
  });
});
