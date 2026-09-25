/**
 * openConfigStore 组装测试（模块设计《服务层-调度引擎》4.2 节、第二版 8.4 节）：首次生成
 * 默认配置、首次内容非法直接拒绝启动、按秒轮询感知外部改动（合法/不合法两种）、save 立即
 * 生效且不会被自己的轮询重复通知一遍；第二版的 updateRaw 在文件原文上改、写回前备份、
 * 校验失败不动文件、并发调用串行。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type FleetConfig, parseConfigText, reorderPoolsRaw, setPoolEnabledRaw } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configBackupsDir } from "../../src/app/paths.js";
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
  let backupsDir: string;
  let logger: FakeLogger;
  let store: ConfigStore | null;

  beforeEach(async () => {
    dir = await createTempDir("fleet-configstore-");
    file = join(dir, "config.json");
    backupsDir = configBackupsDir(dir);
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
    expect(store.current().rawOutputRetentionDays).toBe(7);
    expect(store.current().pools[0]?.id).toBe("dsf");

    const written = await readFile(file, "utf8");
    expect(parseConfigText(written).ok).toBe(true);
    const lines = written.split("\n");
    expect(lines[1]).toMatch(/^ {2}"/);
    // 生成的默认配置文件里也不写已废弃的字段
    expect(written).not.toContain("retentionDays");
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

  describe("updateRaw", () => {
    /** 写一份带手写字段的原始配置，返回原文，供断言"其余字段原样"用。 */
    async function writeRawConfig(): Promise<string> {
      const text = `${JSON.stringify(
        {
          version: 1,
          port: 4870,
          defaults: {},
          _note: "手写备注",
          pools: [
            {
              id: "a",
              label: "池 A",
              capacity: 3,
              runtimes: { pi: { provider: "p", model: "m" } },
            },
            {
              id: "b",
              label: "池 B",
              capacity: 4,
              enabled: false,
              runtimes: { pi: { provider: "p", model: "m" } },
            },
          ],
          roles: [{ id: "worker", label: "工人" }],
        },
        null,
        2,
      )}\n`;
      await writeFile(file, text, "utf8");
      return text;
    }

    it("写回后 current() 立即变、文件里其余字段和顺序原样、通知一次且不会被轮询重复通知", async () => {
      await writeRawConfig();
      store = openConfigStore(file, logger);
      expect(store.current().pools.map((pool) => pool.id)).toEqual(["a", "b"]);

      let notified = 0;
      store.onChange(() => {
        notified += 1;
      });

      await store.updateRaw((raw) => setPoolEnabledRaw(raw, "a", false));

      expect(store.current().pools[0]?.enabled).toBe(false);
      expect(store.current().pools[1]?.enabled).toBe(false);
      expect(notified).toBe(1);

      const written = await readFile(file, "utf8");
      // 手写字段保留；写回的是原始对象，不会被 zod 补齐出一堆默认值
      expect(written).toContain('"_note": "手写备注"');
      expect(written).not.toContain("rawOutputRetentionDays");
      expect(written).not.toContain("perProjectCap");
      expect(JSON.parse(written).pools[0]).toEqual({
        id: "a",
        label: "池 A",
        capacity: 3,
        enabled: false,
        runtimes: { pi: { provider: "p", model: "m" } },
      });

      await delay(1300);
      expect(notified).toBe(1);
    });

    it("校验失败时抛 config_invalid，文件一动不动", async () => {
      const before = await writeRawConfig();
      store = openConfigStore(file, logger);

      await expect(
        store.updateRaw((raw) => {
          const next = raw as { pools: Record<string, unknown>[] };
          // 把容量改成越界值，parseConfig 会拒绝
          return {
            ...next,
            pools: next.pools.map((pool) => ({
              ...pool,
              capacity: 9999,
            })),
          };
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "config_invalid",
          message: expect.stringContaining("pools.0.capacity"),
        }),
      );

      expect(await readFile(file, "utf8")).toBe(before);
      expect(store.current().pools[0]?.capacity).toBe(3);
    });

    it("文件不是合法 JSON 时抛 config_invalid，edit 不会被调用", async () => {
      // openConfigStore 首次就要能解析，所以先让它生成合法文件，再把文件改坏
      store = openConfigStore(file, logger);
      await writeFile(file, "{ 坏掉的 JSON", "utf8");

      let called = false;
      await expect(
        store.updateRaw((raw) => {
          called = true;
          return raw;
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "config_invalid",
          message: expect.stringContaining("配置文件不是合法的 JSON"),
        }),
      );
      expect(called).toBe(false);
    });

    it("edit 抛出的 FleetError 原样抛给调用方", async () => {
      await writeRawConfig();
      store = openConfigStore(file, logger);
      await expect(
        store.updateRaw((raw) => setPoolEnabledRaw(raw, "missing", false)),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "not_found", message: "池不存在：missing" }),
      );
    });

    it("重排池写回后立即生效", async () => {
      await writeRawConfig();
      store = openConfigStore(file, logger);

      await store.updateRaw((raw) => reorderPoolsRaw(raw, ["b", "a"]));

      expect(store.current().pools.map((pool) => pool.id)).toEqual(["b", "a"]);
      expect(
        JSON.parse(await readFile(file, "utf8")).pools.map((p: { id: string }) => p.id),
      ).toEqual(["b", "a"]);
    });

    it("写回前生成备份，超过 50 份时删最旧的", async () => {
      await writeRawConfig();
      store = openConfigStore(file, logger);

      // 先手工放 60 份更早的备份，确认写入后只留最近的 50 份
      await mkdir(backupsDir, { recursive: true });
      for (let i = 0; i < 60; i++) {
        const stamp = `2020-01-01T00-00-${String(i).padStart(2, "0")}-000Z`;
        await writeFile(join(backupsDir, `config-${stamp}.json`), "{}", "utf8");
      }

      await store.updateRaw((raw) => setPoolEnabledRaw(raw, "a", false));

      const backups = (await readdir(backupsDir)).filter((name) => name.endsWith(".json")).sort();
      expect(backups).toHaveLength(50);
      // 最旧的 11 份（2020 年的 60 份 + 新增 1 份，共 61 份，删掉 11 份）都被删了
      expect(backups[0]).toBe("config-2020-01-01T00-00-11-000Z.json");
      const newest = await readFile(
        join(backupsDir, backups[backups.length - 1] as string),
        "utf8",
      );
      expect(newest).toContain('"_note": "手写备注"');
    });

    it("save 写之前也备份", async () => {
      await writeRawConfig();
      store = openConfigStore(file, logger);
      const before = store.current();
      await store.save({
        ...before,
        pools: before.pools.map((pool) => (pool.id === "a" ? { ...pool, capacity: 7 } : pool)),
      });

      const backups = (await readdir(backupsDir)).filter((name) => name.endsWith(".json"));
      expect(backups).toHaveLength(1);
      expect(await readFile(join(backupsDir, backups[0] as string), "utf8")).toContain(
        '"capacity": 3',
      );
    });

    it("并发两次 updateRaw 都生效，后者基于前者的结果", async () => {
      await writeRawConfig();
      store = openConfigStore(file, logger);

      await Promise.all([
        store.updateRaw((raw) => setPoolEnabledRaw(raw, "a", false)),
        store.updateRaw((raw) => reorderPoolsRaw(raw, ["b", "a"])),
      ]);

      expect(store.current().pools.map((pool) => pool.id)).toEqual(["b", "a"]);
      const written = JSON.parse(await readFile(file, "utf8"));
      expect(written.pools[0].id).toBe("b");
      expect(written.pools[1]).toMatchObject({ id: "a", enabled: false });
      expect(written._note).toBe("手写备注");
    });

    it("edit 期间外部改了文件：重新读原文重来，不把外部修改覆盖掉", async () => {
      await writeRawConfig();
      store = openConfigStore(file, logger);

      let calls = 0;
      await store.updateRaw((raw) => {
        calls += 1;
        if (calls === 1) {
          // 模拟外部进程在「读原文」和「写回」之间改了文件：加一个手写字段。
          const external = JSON.parse(readFileSync(file, "utf8"));
          external._external = "外部改的";
          writeFileSync(file, JSON.stringify(external, null, 2), "utf8");
        }
        return setPoolEnabledRaw(raw, "a", false);
      });

      // 第一次的编辑基于旧原文，被丢掉重来；第二次基于外部改后的原文。
      expect(calls).toBe(2);
      const written = JSON.parse(await readFile(file, "utf8"));
      expect(written._external).toBe("外部改的");
      expect(written._note).toBe("手写备注");
      expect(written.pools[0]).toMatchObject({ id: "a", enabled: false });
    });

    it("外部持续修改时重试 3 次后抛 conflict，不动文件", async () => {
      await writeRawConfig();
      store = openConfigStore(file, logger);

      let calls = 0;
      await expect(
        store.updateRaw((raw) => {
          calls += 1;
          // 每次编辑期间都再改一次文件，模拟别处一直在写：永远追不上。
          const external = JSON.parse(readFileSync(file, "utf8"));
          external[`_external${calls}`] = calls;
          writeFileSync(file, JSON.stringify(external, null, 2), "utf8");
          return setPoolEnabledRaw(raw, "a", false);
        }),
      ).rejects.toThrowError(
        expect.objectContaining({
          code: "conflict",
          message: "配置文件正在被别处修改，请稍后再试",
        }),
      );
      // 1 次初始 + 最多 3 次重来
      expect(calls).toBe(4);
      // 文件停在外部最后写的那份，没有被我们覆盖。
      expect(JSON.parse(await readFile(file, "utf8"))._external4).toBe(4);
    });

    it("同一毫秒内的两次备份不互相覆盖（文件名带序号）", async () => {
      await writeRawConfig();
      store = openConfigStore(file, logger);

      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        vi.setSystemTime(new Date("2026-10-25T01:00:00.000Z"));
        await store.updateRaw((raw) => setPoolEnabledRaw(raw, "a", false));
        await store.updateRaw((raw) => setPoolEnabledRaw(raw, "b", false));
      } finally {
        vi.useRealTimers();
      }

      const backups = (await readdir(backupsDir)).filter((name) => name.endsWith(".json")).sort();
      expect(backups).toHaveLength(2);
      expect(backups[0]).toBe("config-2026-10-25T01-00-00-000Z-001.json");
      expect(backups[1]).toBe("config-2026-10-25T01-00-00-000Z-002.json");
      // 两份内容确实不同：第二份是第一份写回之后的原文。
      const contents = await Promise.all(
        backups.map((name) => readFile(join(backupsDir, name as string), "utf8")),
      );
      expect(contents[0]).not.toBe(contents[1]);
      expect(JSON.parse(contents[0] as string).pools[0].enabled).toBeUndefined();
      expect(JSON.parse(contents[1] as string).pools[0].enabled).toBe(false);
    });
  });
});
