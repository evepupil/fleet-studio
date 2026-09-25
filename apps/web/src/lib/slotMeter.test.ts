import type { PoolView, SlotView } from "@fleet/core";
import { describe, expect, it } from "vitest";
import { groupSegments, meterWidthStyle } from "./slotMeter";

function slot(projectKey: string, runId: string): SlotView {
  return {
    projectKey,
    runId,
    workerId: `worker-${runId}`,
    title: runId,
    role: "builder",
    roleLabel: "构建",
    startedAt: "2026-09-01T00:00:00.000Z",
    retrying: false,
  };
}

function pool(capacity: number, running: number): PoolView {
  return {
    id: "pool",
    label: "Pool",
    model: "model",
    channel: "channel",
    modelName: "model",
    priority: 1,
    enabled: true,
    capacity,
    perProjectCap: null,
    running,
    queued: 0,
    slots: [],
    queuedByProject: [],
    health: { windowMinutes: 60, completed: 0, failed: 0, retrying: 0 },
    recent: { windowHours: 24, completed: 0, failed: 0, avgRunMs: null },
    usageToday: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      costUsd: null,
    },
  };
}

describe("groupSegments", () => {
  it("collects projects in first-seen order", () => {
    expect(groupSegments([slot("a", "1"), slot("b", "2"), slot("a", "3")])).toEqual([
      { projectKey: "a", slots: [slot("a", "1"), slot("a", "3")] },
      { projectKey: "b", slots: [slot("b", "2")] },
    ]);
  });
});

describe("meterWidthStyle", () => {
  it("uses a stable cell width, clamps segmented pools, and has a fallback", () => {
    expect(meterWidthStyle([])).toBe("120px");
    expect(meterWidthStyle([pool(2, 3)])).toBe("88px");
    expect(meterWidthStyle([pool(80, 0)])).toBe("1438px");
  });
});
