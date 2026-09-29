import { create } from "zustand";
import type { TaskView } from "@/lib/taskFilters";

interface ViewState {
  lastTasksView: TaskView;
  setLastTasksView(view: TaskView): void;
}

export function tasksPath(view: TaskView): string {
  return view === "board" ? "/tasks" : "/tasks/list";
}

export const useViewStore = create<ViewState>((set) => ({
  lastTasksView: "board",
  setLastTasksView: (lastTasksView) => set({ lastTasksView }),
}));
