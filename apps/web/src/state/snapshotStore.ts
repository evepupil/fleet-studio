import type { Snapshot } from "@fleet/core";
import { create } from "zustand";
import type { ConnectionState } from "@/api/dataSource";

interface SnapshotState {
  snapshot: Snapshot | null;
  connection: ConnectionState;
  everOpened: boolean;
  setSnapshot(snapshot: Snapshot): void;
  setConnection(connection: ConnectionState): void;
}

let reconnect: (() => void) | null = null;

export function setSnapshotReconnect(callback: (() => void) | null): void {
  reconnect = callback;
}

export function reconnectSnapshot(): void {
  reconnect?.();
}

export const useSnapshotStore = create<SnapshotState>((set) => ({
  snapshot: null,
  connection: "connecting",
  everOpened: false,
  setSnapshot: (snapshot) => set({ snapshot }),
  setConnection: (connection) =>
    set((state) => ({
      connection,
      everOpened: state.everOpened || connection === "open",
    })),
}));
