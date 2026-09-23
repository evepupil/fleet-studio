/**
 * createProcessHost 组装测试（规格第 3.7 节）：resolve/spawn/kill/isAlive 真的串起来能用，
 * workerEnv 有 60 秒缓存，invalidate 同时清掉两块缓存。
 */

import { join } from "node:path";
import type { FleetConfig } from "@fleet/core";
import { fakePiCommand, scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProcessHost } from "../../src/process/processHost.js";
import { createFakeLogger } from "./support/fakeLogger.js";
import { createTempDir, removeTempDir } from "./support/tempDir.js";
import { baseFleetConfig, withRuntimeCommand } from "./support/testConfig.js";
import { waitFor } from "./support/waitFor.js";

describe("createProcessHost", () => {
  let tempDir: string;
  let config: FleetConfig;
  const spawnedPids: number[] = [];

  beforeEach(async () => {
    tempDir = await createTempDir("fleet-processhost-");
    config = withRuntimeCommand(baseFleetConfig(), "pi", fakePiCommand());
  });

  afterEach(async () => {
    const host = createProcessHost({ getConfig: () => config, logger: createFakeLogger() });
    for (const pid of spawnedPids.splice(0)) {
      await host.kill(pid);
    }
    await removeTempDir(tempDir);
  });

  it("resolve 走配置覆盖，拿到假 pi 的可执行文件", async () => {
    const host = createProcessHost({ getConfig: () => config, logger: createFakeLogger() });
    const resolved = await host.resolve("pi");
    expect(resolved.executable).toBe(process.execPath);
    expect(resolved.image).toBe("node.exe");
  });

  it("resolve → spawn → isAlive → kill 串起来能用（用假 pi 的 hang 剧本）", async () => {
    const host = createProcessHost({ getConfig: () => config, logger: createFakeLogger() });
    const command = await host.resolve("pi");
    const prompt = scenarioPrompt("hang");

    const spawned = await host.spawn({
      command,
      args: ["--session-id", "processhost-hang", "-p", prompt],
      cwd: tempDir,
      env: await host.workerEnv(),
      stdoutPath: join(tempDir, "out.jsonl"),
      stderrPath: join(tempDir, "err.log"),
      files: [],
    });
    spawnedPids.push(spawned.pid);

    expect(await host.isAlive(spawned.pid, spawned.image)).toBe(true);

    await host.kill(spawned.pid);
    await waitFor(async () => !(await host.isAlive(spawned.pid, spawned.image)));
    expect(await host.isAlive(spawned.pid, spawned.image)).toBe(false);
  });

  it("spawn 启动失败时抛 FleetError（工作目录不存在）", async () => {
    const host = createProcessHost({ getConfig: () => config, logger: createFakeLogger() });
    const command = await host.resolve("pi");
    await expect(
      host.spawn({
        command,
        args: ["--session-id", "x", "-p", "hi"],
        cwd: join(tempDir, "does-not-exist"),
        env: await host.workerEnv(),
        stdoutPath: join(tempDir, "out.jsonl"),
        stderrPath: join(tempDir, "err.log"),
        files: [],
      }),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("workerEnv 在缓存窗口内重复调用返回同一份结果（不重新计算）", async () => {
    const host = createProcessHost({ getConfig: () => config, logger: createFakeLogger() });
    const first = await host.workerEnv();
    const second = await host.workerEnv();
    expect(second).toBe(first); // 同一个对象引用：命中缓存，没有重新读注册表
  });

  it("invalidate 之后 workerEnv 会重新计算（值可能一样，但不再是同一个对象）", async () => {
    const host = createProcessHost({ getConfig: () => config, logger: createFakeLogger() });
    const first = await host.workerEnv();
    host.invalidate();
    const second = await host.workerEnv();
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it("workerEnv 缓存 60 秒，过期后重新计算", async () => {
    const host = createProcessHost({ getConfig: () => config, logger: createFakeLogger() });
    const first = await host.workerEnv();

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 61_000);
      const second = await host.workerEnv();
      expect(second).not.toBe(first);
      expect(second).toEqual(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it("invalidate 同时清掉可执行文件缓存：换配置后 resolve 会用新的 command", async () => {
    let currentCommand = fakePiCommand();
    const host = createProcessHost({
      getConfig: () => withRuntimeCommand(baseFleetConfig(), "pi", currentCommand),
      logger: createFakeLogger(),
    });

    const first = await host.resolve("pi");
    expect(first.prefixArgs).toEqual(currentCommand.slice(1));

    // 配置覆盖路径本身每次都读最新配置，不需要 invalidate 就能感知变化；
    // 这里主要确认 invalidate 调用本身不会出错、且之后 resolve 依然可用。
    currentCommand = [currentCommand[0] ?? "", ...currentCommand.slice(1), "--extra"];
    host.invalidate();
    const second = await host.resolve("pi");
    expect(second.prefixArgs).toEqual(currentCommand.slice(1));
  });
});
