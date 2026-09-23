import { API_PATHS } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pollUntil } from "./pollUntil.js";
import { startTestServer, type TestServer } from "./testServer.js";

describe("GET /api/wait", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("成功路径：查询参数解析后原样传给 service.wait，超时秒数换算成毫秒", async () => {
    server.service.wait = async (ids, mode, timeoutMs) => {
      expect(ids).toEqual(["w1", "w2"]);
      expect(mode).toBe("any");
      expect(timeoutMs).toBe(5000);
      return { done: [], pending: ["w1", "w2"], timedOut: false };
    };

    const res = await fetch(`${server.baseUrl}${API_PATHS.wait}?ids=w1,w2&mode=any&timeoutSec=5`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ done: [], pending: ["w1", "w2"], timedOut: false });
  });

  it("客户端提前断开时，服务收到中止信号", async () => {
    let receivedSignal: AbortSignal | undefined;
    let waitCalled = false;

    server.service.wait = (ids, _mode, _timeoutMs, signal) => {
      receivedSignal = signal;
      waitCalled = true;
      return new Promise((resolve) => {
        signal.addEventListener("abort", () => {
          resolve({ done: [], pending: [...ids], timedOut: true });
        });
      });
    };

    const controller = new AbortController();
    const fetchPromise = fetch(`${server.baseUrl}${API_PATHS.wait}?ids=w1&timeoutSec=30`, {
      signal: controller.signal,
    }).catch(() => {
      // 主动中止会让 fetch 自己抛 AbortError，测试只关心服务端是否收到信号，这里吞掉即可。
    });

    await pollUntil(() => waitCalled);
    controller.abort();
    await fetchPromise;

    await pollUntil(() => receivedSignal?.aborted === true);
    expect(receivedSignal?.aborted).toBe(true);
  });
});
