/** 假配置存储：内存里保存一份配置，save/setConfig 都会触发 onChange 监听者。 */
import { type FleetConfig, FleetError, parseConfig } from "@fleet/core";
import type { ConfigStore } from "../../../src/app/types.js";

export interface FakeConfigStore extends ConfigStore {
  /** 测试直接替换生效配置并触发通知，模拟「配置文件被外部改了」。 */
  setConfig(config: FleetConfig): void;
  setError(message: string | null): void;
  readonly saveCallCount: number;
}

export function createFakeConfigStore(initial: FleetConfig): FakeConfigStore {
  let current = initial;
  let error: string | null = null;
  let saveCallCount = 0;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    current(): FleetConfig {
      return current;
    },
    error(): string | null {
      return error;
    },
    onChange(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async save(config: FleetConfig): Promise<void> {
      saveCallCount += 1;
      current = config;
      error = null;
      notify();
    },
    async updateRaw(edit: (raw: unknown) => unknown): Promise<void> {
      saveCallCount += 1;
      const result = parseConfig(edit(current));
      if (!result.ok) {
        throw new FleetError("config_invalid", `配置文件有错：${result.issues.join("；")}`);
      }
      current = result.config;
      error = null;
      notify();
    },
    close(): void {},
    setConfig(config: FleetConfig): void {
      current = config;
      notify();
    },
    setError(message: string | null): void {
      error = message;
      notify();
    },
    get saveCallCount(): number {
      return saveCallCount;
    },
  };
}
