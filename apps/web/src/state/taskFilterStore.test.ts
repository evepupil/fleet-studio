import { afterEach, describe, expect, it } from "vitest";
import { useTaskFilterStore } from "./taskFilterStore";

afterEach(() => {
  useTaskFilterStore.getState().reset();
});

describe("taskFilterStore overview filters", () => {
  it("stores channel and model filters and clears them on reset", () => {
    useTaskFilterStore.getState().set({ channel: "anthropic", model: "claude-sonnet" });
    expect(useTaskFilterStore.getState()).toMatchObject({
      channel: "anthropic",
      model: "claude-sonnet",
    });

    useTaskFilterStore.getState().reset();
    expect(useTaskFilterStore.getState().channel).toBeUndefined();
    expect(useTaskFilterStore.getState().model).toBeUndefined();
  });

  it("applies channel and model filters from overview after resetting defaults", () => {
    useTaskFilterStore.getState().set({ channel: "stale", model: "stale-model", status: "failed" });
    useTaskFilterStore
      .getState()
      .applyFromOverview({ channel: "anthropic", model: "claude-sonnet" });

    expect(useTaskFilterStore.getState()).toMatchObject({
      channel: "anthropic",
      model: "claude-sonnet",
      status: "active",
      range: { kind: "all" },
    });
  });
});
