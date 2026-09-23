/**
 * createProcessHost 组装测试（规格第 3.7 节）：resolve/spawn/kill/isAlive 真的串起来能用，
 * workerEnv 有 60 秒缓存，invalidate 同时清掉两块缓存。
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import type { FleetConfig } from "@fleet/core";
import { fakePiCommand, scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IdentityQuery } from "../../src/process/identityProbe.js";
import { createProcessHost, IDENTITY_RECHECK_MS } from "../../src/process/processHost.js";
import { createFakeLogger } from "./support/fakeLogger.js";
import { createTempDir, removeTempDir } from "./support/tempDir.js";
import { baseFleetConfig, withRuntimeCommand } from "./support/testConfig.js";
import { waitFor } from "./support/waitFor.js";

/** 起一个真实存在、能被 tasklist/WMI 查到的长命 node 进程，不经过 host.spawn（模拟「接管」的号）。 */
function spawnRawNodeProcess(): number {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true,
    stdio: "ignore",
  });
  const pid = child.pid;
  if (pid === undefined) {
    throw new Error("测试用的子进程没有拿到 pid");
  }
  child.unref();
  return pid;
}

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
      // 收尾清理，不核对身份：只要这个号上还有进程就杀掉，不管它是不是被复用过。
      await host.kill(pid, null);
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
    const spawnedAtMs = Date.now();

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
    const identity = { image: spawned.image, spawnedAtMs };

    expect(await host.isAlive(spawned.pid, identity)).toBe(true);

    await host.kill(spawned.pid, identity);
    await waitFor(async () => !(await host.isAlive(spawned.pid, identity)));
    expect(await host.isAlive(spawned.pid, identity)).toBe(false);
  });

  it("身份核对：spawnedAtMs 比真实创建时间早 10 秒时，isAlive 为假、kill 不会动它", async () => {
    const host = createProcessHost({ getConfig: () => config, logger: createFakeLogger() });
    // 不经过 host.spawn：这个号不是这个进程托管实例自己拉起来的，模拟「接管」场景——
    // 只有这样才会走身份核对，不会命中「自己启动」的快路径（模块设计 3.5 性能约束第 1 条）。
    const pid = spawnRawNodeProcess();
    spawnedPids.push(pid);
    const spawnedAtMs = Date.now();
    await waitFor(async () => host.isAlive(pid, null)); // 等系统真的能查到这个号

    const correctIdentity = { image: "node.exe", spawnedAtMs };
    expect(await host.isAlive(pid, correctIdentity)).toBe(true);

    // 等价于「这个号现在属于一个比预期更晚创建的进程」：真实进程的创建时间比这份身份
    // 声称的时刻晚了 10 秒，超出了核对身份的容差，判定为不是当初那个进程。
    const staleIdentity = { image: "node.exe", spawnedAtMs: spawnedAtMs - 10_000 };
    expect(await host.isAlive(pid, staleIdentity)).toBe(false);

    await host.kill(pid, staleIdentity);
    // kill 核对身份不通过就应该静默返回，绝不能动它——用正确身份确认进程仍然活着。
    expect(await host.isAlive(pid, correctIdentity)).toBe(true);

    // 测试收尾：换回正确身份才能真正结束它。
    await host.kill(pid, correctIdentity);
    await waitFor(async () => !(await host.isAlive(pid, correctIdentity)));
  }, 45_000); // 这条测试要真的起 5 次 PowerShell 查 WMI，实测单次约 1.7 秒，全仓并行跑时留足余量

  it("快路径：自己 spawn 的进程 kill、isAlive 不触发身份查询；退出后移出名单", async () => {
    let queryCalls = 0;
    const countingQuery: IdentityQuery = async (pids) => {
      queryCalls += 1;
      return pids.map((pid) => `${pid}|node.exe|${Date.now()}`).join("\n");
    };
    const host = createProcessHost({
      getConfig: () => config,
      logger: createFakeLogger(),
      identityQuery: countingQuery,
    });
    const command = await host.resolve("pi");
    const spawned = await host.spawn({
      command,
      args: ["--session-id", "processhost-selfspawn", "-p", scenarioPrompt("hang")],
      cwd: tempDir,
      env: await host.workerEnv(),
      stdoutPath: join(tempDir, "out.jsonl"),
      stderrPath: join(tempDir, "err.log"),
      files: [],
    });
    spawnedPids.push(spawned.pid);
    const identity = { image: spawned.image, spawnedAtMs: Date.now() };

    expect(await host.isAlive(spawned.pid, identity)).toBe(true);
    await host.kill(spawned.pid, identity);
    // 自己刚 spawn 出来、还没收到退出事件的号，全程不用查身份——句柄在手，不可能被复用。
    expect(queryCalls).toBe(0);

    // 等它真的退出：从「自己启动」名单里移出。
    await waitFor(async () => !(await host.isAlive(spawned.pid, identity)));

    // 移出名单之后，同一个号（哪怕已经死了）再 kill 一次会走非自己启动的身份核对路径，
    // 这条路径每次都会真的发起一次身份查询——借此证明它确实不在快路径名单里了。
    await host.kill(spawned.pid, identity);
    expect(queryCalls).toBe(1);
  });

  it("降频：接管的号在 30 秒缓存窗口内连续 isAlive 只真的核对一次，超过窗口再核对一次；kill 每次都核对", async () => {
    let queryCalls = 0;
    let clockMs = Date.now();
    const spawnedAtMs = clockMs; // 身份固定不变，只有「现在几点」在走——不能把两者混在一起
    const countingQuery: IdentityQuery = async (pids) => {
      queryCalls += 1;
      // 真实创建时间恒定早于 spawnedAtMs：查询结果不随着「现在几点」的时钟推进而变化，
      // 这样后面推进 clockMs 只是在模拟「时间流逝」，不会误判成「进程被换了个新的」。
      return pids.map((pid) => `${pid}|node.exe|${spawnedAtMs - 100}`).join("\n");
    };
    const host = createProcessHost({
      getConfig: () => config,
      logger: createFakeLogger(),
      identityQuery: countingQuery,
      now: () => clockMs,
    });
    // 不经过 host.spawn：模拟接管场景，才会真的走「完整核对 + 30 秒缓存」这条路径。
    const pid = spawnRawNodeProcess();
    spawnedPids.push(pid);
    await waitFor(async () => host.isAlive(pid, null));

    const identity = { image: "node.exe", spawnedAtMs };

    expect(await host.isAlive(pid, identity)).toBe(true);
    expect(queryCalls).toBe(1);

    clockMs += IDENTITY_RECHECK_MS - 5_000; // 还在 30 秒缓存窗口内
    expect(await host.isAlive(pid, identity)).toBe(true);
    expect(queryCalls).toBe(1); // 命中缓存，没有新查询

    clockMs += 10_000; // 累计超过 30 秒缓存窗口
    expect(await host.isAlive(pid, identity)).toBe(true);
    expect(queryCalls).toBe(2);

    await host.kill(pid, identity);
    expect(queryCalls).toBe(3); // kill 不看缓存，每次都真的核对

    await host.kill(pid, identity);
    expect(queryCalls).toBe(4); // 再 kill 一次还是真的核对，哪怕上一次刚查过

    await waitFor(async () => !(await host.isAlive(pid, identity)));
  }, 30_000); // 这条测试用的是注入的假查询（近乎瞬时），放宽只是给真实进程收尾留余量

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
