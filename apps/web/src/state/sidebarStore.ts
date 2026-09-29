import { create } from "zustand";

interface SidebarState {
  open: boolean;
  drawerOpen: boolean;
  setOpen(value: boolean): void;
  toggle(): void;
  setDrawerOpen(value: boolean): void;
}

function readOpen(): boolean {
  if (typeof localStorage === "undefined") return true;
  const value = localStorage.getItem("fleet.sidebar");
  return value !== "closed" && value !== "collapsed";
}

function persistOpen(open: boolean): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("fleet.sidebar", open ? "open" : "closed");
  }
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  open: readOpen(),
  drawerOpen: false,
  setOpen: (open) => {
    persistOpen(open);
    set({ open });
  },
  toggle: () => {
    const open = !get().open;
    persistOpen(open);
    set({ open });
  },
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
}));
