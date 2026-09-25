import { SSE_EVENTS } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoScenario } from "./demo/scenarios";
import { createLiveDataSource } from "./liveSource";

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readonly listeners = new Map<string, EventListener>();
  closed = false;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.set(type, listener as EventListener);
  }

  emit(type: string, event: Event): void {
    this.listeners.get(type)?.(event);
  }

  fail(): void {
    this.onerror?.(new Event("error"));
  }

  close(): void {
    this.closed = true;
  }
}

describe("live snapshot stream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reports an initial disconnect once and accepts snapshots after reconnecting", async () => {
    const snapshot = buildDemoScenario("busy").snapshot;
    const snapshots: unknown[] = [];
    const connections: string[] = [];
    const unsubscribe = createLiveDataSource().subscribeSnapshot(
      (value) => snapshots.push(value),
      (value) => connections.push(value),
    );
    const first = FakeEventSource.instances[0];

    expect(first).toBeDefined();
    expect(connections).toEqual(["connecting"]);

    first?.fail();
    first?.fail();
    first?.emit(
      SSE_EVENTS.snapshot,
      Object.assign(new Event(SSE_EVENTS.snapshot), { data: JSON.stringify(snapshot) }),
    );

    expect(connections).toEqual(["connecting", "lost"]);
    expect(snapshots).toEqual([]);
    expect(first?.closed).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    const second = FakeEventSource.instances[1];
    expect(second).toBeDefined();
    expect(connections).toEqual(["connecting", "lost", "connecting"]);

    second?.emit(
      SSE_EVENTS.snapshot,
      Object.assign(new Event(SSE_EVENTS.snapshot), { data: JSON.stringify(snapshot) }),
    );
    expect(connections).toEqual(["connecting", "lost", "connecting", "open"]);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ version: snapshot.version, live: snapshot.live });

    unsubscribe();
    second?.fail();
    expect(connections).toEqual(["connecting", "lost", "connecting", "open"]);
  });
});
