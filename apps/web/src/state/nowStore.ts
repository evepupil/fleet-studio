import { create } from "zustand";
import type { DataSource } from "@/api/dataSource";

const TICK_MS = 1000;

interface NowState {
  nowMs: number;
}

const store = create<NowState>(() => ({ nowMs: Date.now() }));
let started = false;

export function initNow(dataSource: DataSource): void {
  if (started) {
    return;
  }
  started = true;
  const fixed = dataSource.fixedNow();
  if (fixed !== null) {
    store.setState({ nowMs: fixed });
    return;
  }
  store.setState({ nowMs: Date.now() });
  setInterval(() => store.setState({ nowMs: Date.now() }), TICK_MS);
}

export function useNow(): number {
  return store((state) => state.nowMs);
}
