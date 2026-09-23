import { API_PATHS, SSE_EVENTS } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSnapshot } from "./fixtures.js";
import { pollUntil } from "./pollUntil.js";
import { SseClient } from "./sseClient.js";
import { startTestServer, type TestServer } from "./testServer.js";

describe("GET /api/stream（全局 SSE）", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    // SSE 连接是长连接，测试断言失败时如果没断开，server.close() 会一直等这条连接结束，
    // 挂到 afterEach 超时；每个用例内部都要保证 disconnect，这里再兜底一次双重保险。
    await server.close();
  });

  it("连上立刻收到一条 event: snapshot，内容是完整快照", async () => {
    const snapshot = createSnapshot({ version: "for-stream-test" });
    server.service.snapshot = () => snapshot;

    const controller = new AbortController();
    const res = await fetch(`${server.baseUrl}${API_PATHS.stream}`, { signal: controller.signal });
    const client = new SseClient(res, controller);
    try {
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      expect(res.headers.get("cache-control")).toContain("no-cache");

      await client.waitForCount(1);

      const first = client.received()[0];
      expect(first?.event).toBe(SSE_EVENTS.snapshot);
      expect(JSON.parse(first?.data ?? "null")).toEqual(snapshot);
    } finally {
      await client.disconnect();
    }
  });

  it("连续触发 10 次变化，300 毫秒内最多发一次，且最后一次一定发出（尾随节流）", async () => {
    let version = 0;
    server.service.snapshot = () => createSnapshot({ version: String(version) });

    const controller = new AbortController();
    const res = await fetch(`${server.baseUrl}${API_PATHS.stream}`, { signal: controller.signal });
    const client = new SseClient(res, controller);
    try {
      await client.waitForCount(1); // 初始快照

      // 10 次触发之间只隔很短时间，总耗时留足余量，避免测试机负载高时被误判成超过了节流窗口。
      for (let i = 0; i < 10; i++) {
        version += 1;
        server.service.emit({ type: "snapshot" });
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      // 目前最多过了几十毫秒，远没到 300ms 的节流窗口，不应该已经发出第二条。
      expect(client.received().length).toBe(1);

      // 补齐等待，让尾随定时器触发，且读到的应该是最后一次变化时的最新版本号。
      await client.waitForCount(2, 1000);
      expect(client.received().length).toBe(2);
      const second = client.received()[1];
      expect(JSON.parse(second?.data ?? "null").version).toBe(String(version));
    } finally {
      await client.disconnect();
    }
  });

  it("客户端断开后服务端取消订阅", async () => {
    const controller = new AbortController();
    const res = await fetch(`${server.baseUrl}${API_PATHS.stream}`, { signal: controller.signal });
    const client = new SseClient(res, controller);
    try {
      await client.waitForCount(1);
      expect(server.service.listenerCount()).toBe(1);
    } finally {
      await client.disconnect();
    }

    await pollUntil(() => server.service.listenerCount() === 0);
    expect(server.service.listenerCount()).toBe(0);
  });
});
