/**
 * openConfigStore 组装测试（模块设计《服务层-调度引擎》4.2 节）：首次生成默认配置、
 * 首次内容非法直接拒绝启动、按秒轮询感知外部改动（合法/不合法两种）、save 立即生效
 * 且不会被自己的轮询重复通知一遍。
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type FleetConfig, parseConfigText } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConfigStore } from "../../src/app/types.js";
import { openConfigStore } from "../../src/config/configStore.js";
import { createFakeLogger, type FakeLogger } from "./support/fakeLogger.js";
import { createTempDir, removeTempDir } from "./support/tempDir.js";
import { waitFor } from "./support/waitFor.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

describe("openConfigStore", () => {
  let dir: string;
  let file: string;
  let logger: FakeLogger;
  let store: ConfigStore | null;

  beforeEach(async () => {
    dir = await createTempDir("fleet-configstore-");
    file = join(dir, "config.json");
    logger = createFakeLogger();
    store = null;
  });

  afterEach(async () => {
    store?.close();
    await removeTempDir(dir);
  });

  it("文件不存在时按默认配置生成并读取，写入的文件是两空格缩进的 JSON", async () => {
    store = openConfigStore(file, logger);
    expect(store.error()).toBeNull();
    expect(store.current().defaults.pool).toBe("dsf");
    expect(store.current().pools[0]?.id).toBe("dsf");

    const written = await readFile(file, "utf8");
    expect(parseConfigText(written).ok).toBe(true);
    const lines = written.split("\n");
    expect(lines[1]).toMatch(/^ {2}"/);
  });

  it("文件内容不合法时拒绝启动", async () => {
    await writeFile(file, "{ 不是合法 JSON", "utf8");
    expect(() => openConfigStore(file, logger)).toThrowError(
      expect.objectContaining({
        code: "config_invalid",
        message: expect.stringContaining("配置文件有错"),
      }),
    );
  });

  it("热更新：文件被改成另一份合法配置后，轮询感知并替换当前配置", async () => {
    store = openConfigStore(file, logger);
    const before = store.current();
    expect(before.pools[0]?.capacity).toBe(20);

    let notified = 0;
    store.onChange(() => {
      notified += 1;
    });

    await delay(20); // 确保修改时间和刚才生成默认配置那次不同
    const changed: FleetConfig = {
      ...before,
      pools: before.pools.map((pool) => (pool.id === "dsf" ? { ...pool, capacity: 5 } : pool)),
    };
    await writeFile(file, JSON.stringify(changed, null, 2), "utf8");

    await waitFor(() => notified > 0);
    expect(store.current().pools[0]?.capacity).toBe(5);
    expect(store.error()).toBeNull();
  });

  it("热更新：文件被改坏后保留上一份有效配置，记下错误说明", async () => {
    store = openConfigStore(file, logger);
    const before = store.current();

    let notified = 0;
    store.onChange(() => {
      notified += 1;
    });

    await delay(20);
    await writeFile(file, "{ 不是合法 JSON", "utf8");

    await waitFor(() => notified > 0);
    expect(store.current()).toEqual(before);
    expect(store.error()).not.toBeNull();
    expect(logger.records.some((record) => record.level === "warn")).toBe(true);
  });

  it("save：立即生效并通知一次，且不会被下一轮轮询再通知一遍", async () => {
    store = openConfigStore(file, logger);
    const before = store.current();

    let notified = 0;
    store.onChange(() => {
      notified += 1;
    });

    const changed: FleetConfig = {
      ...before,
      pools: before.pools.map((pool) => (pool.id === "dsf" ? { ...pool, capacity: 8 } : pool)),
    };
    await store.save(changed);

    expect(store.current().pools[0]?.capacity).toBe(8);
    expect(notified).toBe(1);

    // 多等一轮以上的轮询（1 秒一次），确认不会被自己刚写的文件触发第二次通知。
    await delay(1300);
    expect(notified).toBe(1);
  });
});
