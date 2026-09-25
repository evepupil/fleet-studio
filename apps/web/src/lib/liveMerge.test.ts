import { describe, expect, it } from "vitest";
import { buildDemoScenario } from "../api/demo/scenarios";
import { mergeLiveSummaries } from "./liveMerge";

describe("mergeLiveSummaries", () => {
  it("preserves snapshot versions and appends only missing live workers", () => {
    const snapshotWorkers = buildDemoScenario("busy").snapshot.workers.slice(0, 1);
    const first = snapshotWorkers[0];
    expect(first).toBeDefined();
    if (first === undefined) {
      return;
    }
    const liveOnly = { ...first, id: "live-only" };
    const merged = mergeLiveSummaries(snapshotWorkers, [
      { ...first, title: "stale title" },
      liveOnly,
    ]);
    expect(merged).toHaveLength(snapshotWorkers.length + 1);
    expect(merged[0]?.title).toBe(first.title);
    expect(merged[1]?.id).toBe("live-only");
  });
});
