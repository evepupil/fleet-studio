import type { Snapshot } from "@fleet/core";
import { create } from "zustand";
import type { ConnectionState } from "../api/dataSource";

interface SnapshotState {
  snapshot: Snapshot | null;
  connection: ConnectionState;
  setSnapshot(snapshot: Snapshot): void;
  setConnection(connection: ConnectionState): void;
}

/** 全局快照和连接状态，全站唯一的一份，由 App 启动时接到数据源上。 */
export const useSnapshotStore = create<SnapshotState>((set) => ({
  snapshot: null,
  connection: "connecting",
  setSnapshot: (snapshot) => set({ snapshot }),
  setConnection: (connection) => set({ connection }),
}));
