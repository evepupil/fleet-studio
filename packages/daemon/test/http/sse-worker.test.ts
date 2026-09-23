import { API_PATHS, SSE_EVENTS, type TimelineEvent, type TimelinePage } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTimelineEvent, createWorkerDetail, createWorkerSummary } from "./fixtures.js";
import { pollUntil } from "./pollUntil.js";
import { SseClient } from "./sseClient.js";
import { startTestServer, type TestServer } from "./testServer.js";

/** 造一批连续 seq 的事件，并给出一个按 after/limit 正确分页的 service.timeline 实现。 */
function makeTimelineFixture(total: number): {
  events: TimelineEvent[];
  handler: (id: string, after: number, limit: number) => Promise<TimelinePage>;
} {
  const events = Array.from({ length: total }, (_, seq) => createTimelineEvent({ seq }));
  return {
    events,
    handler: async (_id, after, limit) => {
      const rest = events.filter((event) => event.seq > after);
      const page = rest.slice(0, limit);
      const last = page[page.length - 1];
      return { events: page, next: last ? last.seq : after, total: events.length };
    },
  };
}

describe("GET /api/workers/:id/stream", () => {
  let server: TestServer;

  beforeEach(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    // SSE 连接是长连接，测试断言失败时如果没断开，server.close() 会一直等这条连接结束，
    // 挂到 afterEach 超时；每个用例内部都要保证 disconnect，这里再兜底一次双重保险。
    await server.close();
  });

  it("苦工不存在时 404，不开流", async () => {
    server.service.getWorker = () => null;

    const res = await fetch(`${server.baseUrl}${API_PATHS.workerStream("wnotfound")}`);

    expect(res.status).toBe(404);
  });

  it("连上先发完整详情，再把历史事件按每批最多 500 条补完", async () => {
    const detail = createWorkerDetail();
    const { events, handler } = makeTimelineFixture(600);
    server.service.getWorker = () => detail;
    server.service.timeline = handler;

    const controller = new AbortController();
    const res = await fetch(`${server.baseUrl}${API_PATHS.workerStream(detail.summary.id)}`, {
      signal: controller.signal,
    });
    const client = new SseClient(res, controller);
    try {
      // 1 条 worker 详情 + 2 批历史（500 + 100）。
      await client.waitForCount(3);

      const received = client.received();
      expect(received[0]?.event).toBe(SSE_EVENTS.worker);
      expect(JSON.parse(received[0]?.data ?? "null")).toEqual(detail);

      expect(received[1]?.event).toBe(SSE_EVENTS.timeline);
      const firstBatch: TimelineEvent[] = JSON.parse(received[1]?.data ?? "null").events;
      expect(firstBatch).toHaveLength(500);
      expect(firstBatch[0]?.seq).toBe(0);
      expect(firstBatch[499]?.seq).toBe(499);

      expect(received[2]?.event).toBe(SSE_EVENTS.timeline);
      const secondBatch: TimelineEvent[] = JSON.parse(received[2]?.data ?? "null").events;
      expect(secondBatch).toHaveLength(100);
      expect(secondBatch[0]?.seq).toBe(500);
      expect(secondBatch[99]?.seq).toBe(599);
      expect(secondBatch[99]?.seq).toBe(events[599]?.seq);
    } finally {
      await client.disconnect();
    }
  });

  it("补完历史之后，后续 timeline 事件按 seq 去重转发，不重复已经发过的部分", async () => {
    const detail = createWorkerDetail();
    const { handler } = makeTimelineFixture(3); // seq 0、1、2，一批就发完
    server.service.getWorker = () => detail;
    server.service.timeline = handler;

    const controller = new AbortController();
    const res = await fetch(`${server.baseUrl}${API_PATHS.workerStream(detail.summary.id)}`, {
      signal: controller.signal,
    });
    const client = new SseClient(res, controller);
    try {
      await client.waitForCount(2); // worker 详情 + 一批历史（seq 0..2）

      // 推一批时间线事件：seq 2 是已经发过的（防重复应该被过滤掉），3、4 是新的。
      server.service.emit({
        type: "timeline",
        workerId: detail.summary.id,
        events: [
          createTimelineEvent({ seq: 2 }),
          createTimelineEvent({ seq: 3 }),
          createTimelineEvent({ seq: 4 }),
        ],
      });

      await client.waitForCount(3);
      const latest = client.received()[2];
      expect(latest?.event).toBe(SSE_EVENTS.timeline);
      const forwarded: TimelineEvent[] = JSON.parse(latest?.data ?? "null").events;
      expect(forwarded.map((event) => event.seq)).toEqual([3, 4]);
    } finally {
      await client.disconnect();
    }
  });

  it("苦工详情变化节流 500 毫秒后发送最新详情", async () => {
    const detail = createWorkerDetail();
    server.service.getWorker = () => detail;
    server.service.timeline = async (_id, after) => ({ events: [], next: after, total: 0 });

    const controller = new AbortController();
    const res = await fetch(`${server.baseUrl}${API_PATHS.workerStream(detail.summary.id)}`, {
      signal: controller.signal,
    });
    const client = new SseClient(res, controller);
    try {
      await client.waitForCount(1); // 初始详情

      const updated = createWorkerDetail({ summary: createWorkerSummary({ status: "completed" }) });
      server.service.getWorker = () => updated;
      server.service.emit({ type: "worker", workerId: detail.summary.id });

      await client.waitForCount(2, 2000);
      const second = client.received()[1];
      expect(second?.event).toBe(SSE_EVENTS.worker);
      expect(JSON.parse(second?.data ?? "null")).toEqual(updated);
    } finally {
      await client.disconnect();
    }
  });

  it("客户端断开后服务端取消订阅", async () => {
    const detail = createWorkerDetail();
    server.service.getWorker = () => detail;
    server.service.timeline = async (_id, after) => ({ events: [], next: after, total: 0 });

    const controller = new AbortController();
    const res = await fetch(`${server.baseUrl}${API_PATHS.workerStream(detail.summary.id)}`, {
      signal: controller.signal,
    });
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
