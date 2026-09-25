import type { RangeKind, StatsDimension } from "@fleet/core";
import { create } from "zustand";

export interface RangeState {
  kind: RangeKind;
  from?: string;
  to?: string;
}

interface OverviewState {
  range: RangeState;
  dimension: StatsDimension;
  setRange(range: RangeState): void;
  setDimension(dimension: StatsDimension): void;
}

export const useOverviewStore = create<OverviewState>((set) => ({
  range: { kind: "all" },
  dimension: "model",
  setRange: (range) => set({ range }),
  setDimension: (dimension) => set({ dimension }),
}));
