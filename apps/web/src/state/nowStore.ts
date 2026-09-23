import { create } from "zustand";
import type { DataSource } from "../api/dataSource";

const TICK_MS = 1000;

interface NowState {
  nowMs: number;
}

const store = create<NowState>(() => ({ nowMs: Date.now() }));

let started = false;

/**
 * 页面启动时调用一次：演示数据源给固定的「当前时刻」（截图要稳定），
 * 真实数据源就在这里起唯一的一个 1 秒定时器，全站的「现在」都从这一个时钟来。
 */
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
