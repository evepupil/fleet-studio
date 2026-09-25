import type { TaskSortKey, TaskStatusFilter } from "@fleet/core";
import { create } from "zustand";
import type { RangeState } from "./overviewStore";

export interface TaskFilterState {
  status: TaskStatusFilter;
  project?: string | undefined;
  pool?: string | undefined;
  role?: string | undefined;
  channel?: string | undefined;
  model?: string | undefined;
  range: RangeState;
  q: string;
  sort: TaskSortKey;
  order: "asc" | "desc";
}

const DEFAULT_FILTERS: TaskFilterState = {
  status: "active",
  project: undefined,
  pool: undefined,
  role: undefined,
  channel: undefined,
  model: undefined,
  range: { kind: "all" },
  q: "",
  sort: "createdAt",
  order: "desc",
};

interface TaskFilterStore extends TaskFilterState {
  set(partial: Partial<TaskFilterState>): void;
  reset(): void;
  applyFromOverview(partial: Partial<TaskFilterState>): void;
}

export const useTaskFilterStore = create<TaskFilterStore>((set) => ({
  ...DEFAULT_FILTERS,
  set: (partial) => set(partial),
  reset: () => set(DEFAULT_FILTERS),
  applyFromOverview: (partial) => set({ ...DEFAULT_FILTERS, ...partial }),
}));
