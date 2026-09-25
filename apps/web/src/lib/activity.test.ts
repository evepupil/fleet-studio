import { describe, expect, it } from "vitest";
import { buildDemoScenario } from "../api/demo/scenarios";
import { activitySignature } from "./activity";

describe("activitySignature", () => {
  it("includes active worker identities and five live totals", () => {
    const snapshot = buildDemoScenario("busy").snapshot;
    const signature = activitySignature(snapshot);
    expect(signature).toContain(`${snapshot.live.slotsUsed}:${snapshot.live.slotsTotal}`);
    expect(signature).toContain(
      `${snapshot.live.running}:${snapshot.live.queued}:${snapshot.live.retrying}`,
    );
    expect(signature).toContain("#");
  });
});
