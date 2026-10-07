import { API_PATHS, type TimelineEvent } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpApp } from "../../src/http/createApp.js";
import { createFakeService } from "./fakeService.js";
import { createSnapshot, createTimelineEvent, createWorkerDetail } from "./fixtures.js";

describe("SSE routes with clients that stop reading", () => {
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];

  beforeEach(() => vi.useFakeTimers());

  afterEach(async () => {
    for (const reader of readers.splice(0)) await reader.cancel();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
  });

  function harness() {
    const service = createFakeService();
    const app = createHttpApp({
      service,
      token: "test",
      dashboardToken: "test-dashboard",
      getPort: () => 4870,
      webDistDir: ".",
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    return { app, service };
  }

  async function open(app: ReturnType<typeof createHttpApp>, path: string) {
    const response = await app.request(`http://127.0.0.1:4870${path}`, {
      headers: { host: "127.0.0.1:4870" },
    });
    if (response.body === null) throw new Error("Missing SSE response body");
    const reader = response.body.getReader();
    readers.push(reader);
    await reader.read();
    await vi.advanceTimersByTimeAsync(0);
    return reader;
  }

  it("1500 snapshot updates retain no serialized backlog and eventually disconnect", async () => {
    const { app, service } = harness();
    let version = 0;
    const snapshot = vi.fn(() => createSnapshot({ version: String(version) }));
    service.snapshot = snapshot;
    await open(app, API_PATHS.stream);
    expect(service.listenerCount()).toBe(1);
    for (let i = 0; i < 1500; i++) {
      version++;
      service.emit({ type: "snapshot" });
      await vi.advanceTimersByTimeAsync(301);
    }
    expect(snapshot.mock.calls.length).toBeLessThan(10);
    expect(service.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("timeline overflow disconnects, and reconnect can replay every missing event", async () => {
    const { app, service } = harness();
    const detail = createWorkerDetail();
    const events: TimelineEvent[] = [];
    service.getWorker = () => detail;
    service.timeline = async (_id, after, limit) => {
      const selected = events.filter((event) => event.seq > after).slice(0, limit);
      return { events: selected, next: selected.at(-1)?.seq ?? after, total: events.length };
    };
    await open(app, API_PATHS.workerStream(detail.summary.id));
    expect(service.listenerCount()).toBe(1);
    for (let seq = 0; seq < 100; seq++) {
      const event = createTimelineEvent({ seq });
      events.push(event);
      service.emit({ type: "timeline", workerId: detail.summary.id, events: [event] });
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(service.listenerCount()).toBe(0);

    const reader = await open(app, `${API_PATHS.workerStream(detail.summary.id)}?after=12`);
    const batch = await reader.read();
    const text = new TextDecoder().decode(batch.value);
    const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
    const payload = JSON.parse(dataLine?.slice(6) ?? "null");
    expect(payload.events.map((event: TimelineEvent) => event.seq)).toEqual(
      events.filter((event) => event.seq > 12).map((event) => event.seq),
    );
  });

  it("includes events produced while the initial history page is being loaded", async () => {
    const { app, service } = harness();
    const detail = createWorkerDetail();
    const events = [createTimelineEvent({ seq: 0 })];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    service.getWorker = () => detail;
    service.timeline = async (_id, after, limit) => {
      const selected = events.filter((event) => event.seq > after).slice(0, limit);
      if (first) {
        first = false;
        await gate;
      }
      return { events: selected, next: selected.at(-1)?.seq ?? after, total: events.length };
    };
    const reader = await open(app, API_PATHS.workerStream(detail.summary.id));
    expect(service.listenerCount()).toBe(1);
    const next = createTimelineEvent({ seq: 1 });
    events.push(next);
    service.emit({ type: "timeline", workerId: detail.summary.id, events: [next] });
    release();
    const received: number[] = [];
    for (let i = 0; i < 2; i++) {
      const batch = await reader.read();
      const text = new TextDecoder().decode(batch.value);
      const data = text.split("\n").find((line) => line.startsWith("data: "));
      const payload = JSON.parse(data?.slice(6) ?? "null");
      received.push(...payload.events.map((event: TimelineEvent) => event.seq));
    }
    expect(received).toEqual([0, 1]);
  });
});
