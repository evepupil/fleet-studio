import { create } from "zustand";

interface SidebarState {
  collapsed: boolean;
  setCollapsed(collapsed: boolean): void;
  toggle(): void;
}

function readCollapsed(): boolean {
  if (typeof localStorage === "undefined") {
    return false;
  }
  return localStorage.getItem("fleet.sidebar") === "collapsed";
}

function persistCollapsed(collapsed: boolean): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("fleet.sidebar", collapsed ? "collapsed" : "expanded");
  }
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  collapsed: readCollapsed(),
  setCollapsed: (collapsed) => {
    persistCollapsed(collapsed);
    set({ collapsed });
  },
  toggle: () => {
    const collapsed = !get().collapsed;
    persistCollapsed(collapsed);
    set({ collapsed });
  },
}));
