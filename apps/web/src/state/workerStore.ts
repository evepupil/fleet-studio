import type { TimelineEvent, WorkerDetail } from "@fleet/core";
import { create } from "zustand";
import type { DataSource } from "../api/dataSource";
import type { TimelineFilter } from "../lib/timelineView";

export type WorkerStoreStatus = "idle" | "loading" | "ready" | "notFound" | "error";

interface WorkerState {
  id: string | null;
  detail: WorkerDetail | null;
  events: TimelineEvent[];
  status: WorkerStoreStatus;
  error: string | null;
  filter: TimelineFilter;
  open(id: string): void;
  close(): void;
  setFilter(filter: TimelineFilter): void;
}

let dataSource: DataSource | null = null;
let stopSubscription: (() => void) | null = null;

/** 页面启动时调用一次，绑定唯一的数据源实例，open/close 都通过它订阅。 */
export function initWorkerStore(source: DataSource): void {
  dataSource = source;
}

function stop(): void {
  if (stopSubscription !== null) {
    stopSubscription();
    stopSubscription = null;
  }
}

export const useWorkerStore = create<WorkerState>((set, get) => ({
  id: null,
  detail: null,
  events: [],
  status: "idle",
  error: null,
  filter: "all",

  open: (id) => {
    stop();
    set({ id, detail: null, events: [], status: "loading", error: null });
    if (dataSource === null) {
      return;
    }
    stopSubscription = dataSource.subscribeWorker(id, -1, {
      onDetail: (detail) => {
        if (get().id !== id) {
          return;
        }
        set({ detail, status: "ready" });
      },
      onEvents: (newEvents) => {
        if (get().id !== id || newEvents.length === 0) {
          return;
        }
        const current = get().events;
        const last = current.at(-1);
        const maxSeq = last === undefined ? -1 : last.seq;
        const fresh = newEvents.filter((event) => event.seq > maxSeq);
        if (fresh.length === 0) {
          return;
        }
        set({ events: [...current, ...fresh] });
      },
      onNotFound: () => {
        if (get().id !== id) {
          return;
        }
        set({ status: "notFound" });
      },
      onError: (message) => {
        if (get().id !== id) {
          return;
        }
        set({ status: "error", error: message });
      },
    });
  },

  close: () => {
    stop();
    set({ id: null, detail: null, events: [], status: "idle", error: null });
  },

  setFilter: (filter) => set({ filter }),
}));
