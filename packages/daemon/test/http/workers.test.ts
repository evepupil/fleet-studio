import { API_PATHS, FleetError } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWorkerDetail, createWorkerSummary } from "./fixtures.js";
import { readJsonBody, startTestServer, type TestServer } from "./testServer.js";

describe("GET /api/workers", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("成功路径：查询参数按 listWorkersQuerySchema 校验后透传给 service.listWorkers", async () => {
    const summaries = [createWorkerSummary()];
    server.service.listWorkers = (query) => {
      expect(query).toEqual({ status: "running", limit: 10 });
      return summaries;
    };

    const res = await fetch(`${server.baseUrl}${API_PATHS.workers}?status=running&limit=10`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(summaries);
  });

  it("参数校验失败：status 不是合法枚举值时 400 invalid_request", async () => {
    const res = await fetch(`${server.baseUrl}${API_PATHS.workers}?status=not-a-status`);

    expect(res.status).toBe(400);
    const body = await readJsonBody(res);
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toContain("请求参数不对");
  });
});

describe("POST /api/workers", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("成功路径：201 并返回 { worker }", async () => {
    const summary = createWorkerSummary({ id: "wnew01" });
    server.service.submit = async (request) => {
      expect(request.prompt).toBe("写个测试");
      return summary;
    };

    const res = await server.fetchWithToken(API_PATHS.workers, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectPath: "C:\\demo", cwd: "C:\\demo", prompt: "写个测试" }),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ worker: summary });
  });

  it("参数校验失败：缺 prompt 时 400 invalid_request", async () => {
    const res = await server.fetchWithToken(API_PATHS.workers, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectPath: "C:\\demo", cwd: "C:\\demo" }),
    });

    expect(res.status).toBe(400);
    const body = await readJsonBody(res);
    expect(body.error.code).toBe("invalid_request");
  });

  it("runtime_unavailable 错误映射成 422", async () => {
    server.service.submit = async () => {
      throw new FleetError("runtime_unavailable", "找不到运行时");
    };

    const res = await server.fetchWithToken(API_PATHS.workers, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectPath: "C:\\demo", cwd: "C:\\demo", prompt: "写个测试" }),
    });

    expect(res.status).toBe(422);
    expect((await readJsonBody(res)).error.code).toBe("runtime_unavailable");
  });
});

describe("GET /api/workers/:id", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("成功路径：返回完整 WorkerDetail", async () => {
    const detail = createWorkerDetail();
    server.service.getWorker = (id) => (id === "wabc23" ? detail : null);

    const res = await fetch(`${server.baseUrl}${API_PATHS.worker("wabc23")}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(detail);
  });

  it("苦工不存在时 404 not_found", async () => {
    server.service.getWorker = () => null;

    const res = await fetch(`${server.baseUrl}${API_PATHS.worker("wnotfound")}`);

    expect(res.status).toBe(404);
    expect((await readJsonBody(res)).error.code).toBe("not_found");
  });
});

describe("GET /api/workers/:id/timeline", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("成功路径：查询参数按 timelineQuerySchema 校验后透传", async () => {
    const page = { events: [], next: 5, total: 5 };
    server.service.timeline = async (id, after, limit) => {
      expect(id).toBe("wabc23");
      expect(after).toBe(2);
      expect(limit).toBe(50);
      return page;
    };

    const res = await fetch(
      `${server.baseUrl}${API_PATHS.workerTimeline("wabc23")}?after=2&limit=50`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(page);
  });

  it("苦工不存在时 404 not_found", async () => {
    server.service.timeline = async () => null;

    const res = await fetch(`${server.baseUrl}${API_PATHS.workerTimeline("wnotfound")}`);

    expect(res.status).toBe(404);
  });

  it("参数校验失败：after 不是数字时 400 invalid_request", async () => {
    const res = await fetch(`${server.baseUrl}${API_PATHS.workerTimeline("wabc23")}?after=abc`);

    expect(res.status).toBe(400);
  });
});

describe("POST /api/workers/:id/messages", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("成功路径：返回 { worker }", async () => {
    const summary = createWorkerSummary({ runSeq: 2 });
    server.service.send = async (id, request) => {
      expect(id).toBe("wabc23");
      expect(request.prompt).toBe("继续");
      return summary;
    };

    const res = await server.fetchWithToken(API_PATHS.workerMessages("wabc23"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "继续" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ worker: summary });
  });

  it("苦工还在排队或工作中时 409 conflict", async () => {
    server.service.send = async () => {
      throw new FleetError("conflict", "苦工还在跑，不能追加指令");
    };

    const res = await server.fetchWithToken(API_PATHS.workerMessages("wabc23"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "继续" }),
    });

    expect(res.status).toBe(409);
    expect((await readJsonBody(res)).error.code).toBe("conflict");
  });
});

describe("POST /api/workers/:id/cancel", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("成功路径：无请求体，返回 { worker }", async () => {
    const summary = createWorkerSummary({ status: "cancelled" });
    server.service.cancel = async (id) => {
      expect(id).toBe("wabc23");
      return summary;
    };

    const res = await server.fetchWithToken(API_PATHS.workerCancel("wabc23"), { method: "POST" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ worker: summary });
  });
});
