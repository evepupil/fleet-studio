import { create } from "zustand";
import type { CollapsibleColumn } from "@/lib/board";

interface BoardState {
  expanded: ReadonlySet<CollapsibleColumn>;
  toggleExpanded(status: CollapsibleColumn): void;
}

function readExpanded(): ReadonlySet<CollapsibleColumn> {
  if (typeof localStorage === "undefined") return new Set();
  const stored = localStorage.getItem("fleet.board.expanded");
  if (stored === null) return new Set();
  try {
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) return new Set();
    return new Set(
      value.filter((item): item is CollapsibleColumn => item === "failed" || item === "cancelled"),
    );
  } catch {
    return new Set();
  }
}

function persistExpanded(expanded: ReadonlySet<CollapsibleColumn>): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("fleet.board.expanded", JSON.stringify([...expanded]));
  }
}

export const useBoardStore = create<BoardState>((set, get) => ({
  expanded: readExpanded(),
  toggleExpanded: (status) => {
    const expanded = new Set(get().expanded);
    if (expanded.has(status)) expanded.delete(status);
    else expanded.add(status);
    persistExpanded(expanded);
    set({ expanded });
  },
}));
