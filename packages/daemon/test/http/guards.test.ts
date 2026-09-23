import { API_PATHS } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorkerSummary } from "./fixtures.js";
import { readJsonBody, startTestServer, type TestServer } from "./testServer.js";

/**
 * 四道安全校验：主机名、来源、令牌、内容类型。用 /api/health（不需要令牌）测主机名 / 来源，
 * 用 /api/shutdown（需要令牌、无请求体）测令牌，用 POST /api/workers（需要令牌 + JSON 请求体）测内容类型。
 */
describe("安全校验", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  describe("主机名校验", () => {
    it("Host 是 127.0.0.1:<端口> 时放行", async () => {
      const res = await fetch(`${server.baseUrl}${API_PATHS.health}`);
      expect(res.status).toBe(200);
    });

    it("Host 是 localhost:<端口> 时也放行", async () => {
      const res = await server.rawRequest({
        path: API_PATHS.health,
        headers: { host: `localhost:${server.port}` },
      });
      expect(res.status).toBe(200);
    });

    it("Host 不是本机服务地址时 403 forbidden_origin", async () => {
      // fetch() 会按 URL 自动改写 Host，伪造不了，必须用 node:http 自己设请求头。
      const res = await server.rawRequest({
        path: API_PATHS.health,
        headers: { host: "evil.example.com" },
      });
      expect(res.status).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("forbidden_origin");
    });

    it("Host 端口不对时 403 forbidden_origin", async () => {
      const res = await server.rawRequest({
        path: API_PATHS.health,
        headers: { host: `127.0.0.1:${server.port + 1}` },
      });
      expect(res.status).toBe(403);
    });
  });

  describe("来源校验", () => {
    it("不带 Origin 头时放行", async () => {
      const res = await fetch(`${server.baseUrl}${API_PATHS.health}`);
      expect(res.status).toBe(200);
    });

    it("Origin 是看板自身地址时放行", async () => {
      const res = await server.rawRequest({
        path: API_PATHS.health,
        headers: { host: `127.0.0.1:${server.port}`, origin: server.baseUrl },
      });
      expect(res.status).toBe(200);
    });

    it("Origin 不是看板自身地址时 403 forbidden_origin", async () => {
      const res = await server.rawRequest({
        path: API_PATHS.health,
        headers: { host: `127.0.0.1:${server.port}`, origin: "http://evil.example.com" },
      });
      expect(res.status).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error.code).toBe("forbidden_origin");
    });
  });

  describe("令牌校验", () => {
    it("缺令牌时 401 unauthorized", async () => {
      const res = await fetch(`${server.baseUrl}${API_PATHS.shutdown}`, { method: "POST" });
      expect(res.status).toBe(401);
      const body = await readJsonBody(res);
      expect(body.error.code).toBe("unauthorized");
    });

    it("令牌不对时 401 unauthorized", async () => {
      const res = await fetch(`${server.baseUrl}${API_PATHS.shutdown}`, {
        method: "POST",
        headers: { "x-fleet-token": "not-the-real-token" },
      });
      expect(res.status).toBe(401);
    });

    it("令牌不对且长度和真令牌不同时也是 401（定长比较不能因为长度不同就抛异常）", async () => {
      const res = await fetch(`${server.baseUrl}${API_PATHS.shutdown}`, {
        method: "POST",
        headers: { "x-fleet-token": "x" },
      });
      expect(res.status).toBe(401);
    });

    it("令牌正确时放行", async () => {
      const res = await server.fetchWithToken(API_PATHS.shutdown, { method: "POST" });
      expect(res.status).toBe(200);
    });
  });

  describe("内容类型与大小校验", () => {
    it("非 application/json 内容类型时 400 invalid_request", async () => {
      const res = await fetch(`${server.baseUrl}${API_PATHS.workers}`, {
        method: "POST",
        headers: { "x-fleet-token": server.token, "content-type": "text/plain" },
        body: "not json",
      });
      expect(res.status).toBe(400);
      const body = await readJsonBody(res);
      expect(body.error.code).toBe("invalid_request");
    });

    it("请求体超过 1MB 时 400 invalid_request", async () => {
      const hugePrompt = "a".repeat(2 * 1024 * 1024);
      const res = await server.fetchWithToken(API_PATHS.workers, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectPath: "C:\\demo", cwd: "C:\\demo", prompt: hugePrompt }),
      });
      expect(res.status).toBe(400);
      const body = await readJsonBody(res);
      expect(body.error.code).toBe("invalid_request");
    });

    it("内容类型和大小都合规、但请求体不是合法 JSON 时 400 invalid_request", async () => {
      const res = await server.fetchWithToken(API_PATHS.workers, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      });
      expect(res.status).toBe(400);
    });

    it("合法 JSON 请求体正常放行到业务逻辑", async () => {
      server.service.submit = async () => createWorkerSummary();
      const res = await server.fetchWithToken(API_PATHS.workers, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectPath: "C:\\demo", cwd: "C:\\demo", prompt: "写个测试" }),
      });
      expect(res.status).toBe(201);
    });
  });
});
