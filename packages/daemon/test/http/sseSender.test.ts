import { SSEStreamingApi } from "hono/streaming";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSseSender } from "../../src/http/sseSender.js";

function controlledStream() {
  const channel = new TransformStream();
  const stream = new SSEStreamingApi(channel.writable, channel.readable);
  const releases: Array<() => void> = [];
  const writeSSE = vi
    .spyOn(stream, "writeSSE")
    .mockImplementation(() => new Promise<void>((resolve) => releases.push(resolve)));
  const write = vi
    .spyOn(stream, "write")
    .mockImplementation(
      () => new Promise<SSEStreamingApi>((resolve) => releases.push(() => resolve(stream))),
    );
  return { stream, writeSSE, write, release: () => releases.shift()?.() };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe("SSE sender: bounded writes and slow clients", () => {
  const transports: ReturnType<typeof controlledStream>[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    for (const transport of transports.splice(0)) {
      transport.stream.abort();
      transport.release();
    }
    await settle();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function transport() {
    const value = controlledStream();
    transports.push(value);
    return value;
  }

  it("sends ordered events with only one write in flight", async () => {
    const t = transport();
    const sender = createSseSender(t.stream);
    const first = sender.send("timeline", { seq: 0 });
    const second = sender.send("timeline", { seq: 1 });
    const third = sender.send("timeline", { seq: 2 });
    expect(t.writeSSE).toHaveBeenCalledTimes(1);

    t.release();
    await settle();
    expect(t.writeSSE).toHaveBeenCalledTimes(2);
    t.release();
    await settle();
    expect(t.writeSSE).toHaveBeenCalledTimes(3);
    t.release();
    expect(await Promise.all([first, second, third])).toEqual([true, true, true]);
    expect(t.writeSSE.mock.calls.map(([message]) => message.data)).toEqual([
      '{"seq":0}',
      '{"seq":1}',
      '{"seq":2}',
    ]);
  });

  it("coalesces 1500 updates and reads only the latest state after a stalled write", async () => {
    const t = transport();
    const sender = createSseSender(t.stream);
    let version = 0;
    const read = vi.fn(() => ({ version, text: "x".repeat(65_536) }));
    sender.latest("snapshot", read);
    for (let i = 1; i <= 1500; i++) {
      version = i;
      sender.latest("snapshot", read);
    }
    expect(read).toHaveBeenCalledTimes(1);
    expect(t.writeSSE).toHaveBeenCalledTimes(1);
    t.release();
    await settle();
    expect(read).toHaveBeenCalledTimes(2);
    expect(t.writeSSE).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(t.writeSSE.mock.calls[1]?.[0].data)).version).toBe(1500);
  });

  it("shares the queue with heartbeats and coalesces repeated heartbeats", async () => {
    const t = transport();
    const sender = createSseSender(t.stream);
    const initial = sender.send("worker", {});
    for (let i = 0; i < 100; i++) sender.heartbeat();
    sender.latest("worker", () => ({ status: "completed" }));
    expect(t.write).not.toHaveBeenCalled();
    t.release();
    await settle();
    expect(await initial).toBe(true);
    expect(t.write).toHaveBeenCalledTimes(1);
    expect(t.writeSSE).toHaveBeenCalledTimes(1);
    t.release();
    await settle();
    expect(t.writeSSE).toHaveBeenCalledTimes(2);
  });

  it("disconnects and releases pending senders when the message limit is reached", async () => {
    const t = transport();
    const sender = createSseSender(t.stream, { maxPendingMessages: 2 });
    const sends = Array.from({ length: 4 }, (_, seq) => sender.send("timeline", { seq }));
    expect(t.stream.aborted).toBe(true);
    expect(await Promise.all(sends)).toEqual([false, false, false, false]);
    expect(t.writeSSE).toHaveBeenCalledTimes(1);
    expect(await sender.send("timeline", {})).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds UTF-8 bytes as well as message count", async () => {
    const t = transport();
    const sender = createSseSender(t.stream, { maxPendingBytes: 64 });
    const first = sender.send("timeline", {});
    const second = sender.send("timeline", "中".repeat(20));
    expect(t.stream.aborted).toBe(true);
    expect(await Promise.all([first, second])).toEqual([false, false]);
  });

  it("allows one large awaited history page without growing the backlog", async () => {
    const t = transport();
    const sender = createSseSender(t.stream, { maxPendingBytes: 64 });
    const history = sender.send("timeline", { text: "x".repeat(8192) });
    expect(t.stream.aborted).toBe(false);
    t.release();
    expect(await history).toBe(true);
  });

  it("disconnects timed out initial writes and discards lazy updates", async () => {
    const t = transport();
    const sender = createSseSender(t.stream, { writeTimeoutMs: 100 });
    const read = vi.fn(() => ({}));
    const initial = sender.send("snapshot", {});
    sender.latest("snapshot", read);
    sender.heartbeat();
    await vi.advanceTimersByTimeAsync(100);
    expect(t.stream.aborted).toBe(true);
    expect(await initial).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(t.write).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start any more writes after disposal or client abort", async () => {
    const t = transport();
    const sender = createSseSender(t.stream);
    const first = sender.send("timeline", {});
    const second = sender.send("timeline", {});
    sender.dispose();
    expect(await Promise.all([first, second])).toEqual([false, false]);
    t.release();
    await settle();
    sender.latest("snapshot", () => ({}));
    sender.heartbeat();
    expect(t.writeSSE).toHaveBeenCalledTimes(1);
    expect(t.write).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles write failures without leaving pending promises or timers", async () => {
    const t = transport();
    t.writeSSE.mockRejectedValueOnce(new Error("write failed"));
    const sender = createSseSender(t.stream);
    expect(await sender.send("snapshot", {})).toBe(false);
    expect(t.stream.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
