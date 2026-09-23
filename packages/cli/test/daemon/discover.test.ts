import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { daemonLogPath, ensureDaemon, findRunningDaemon } from "../../src/daemon/discover.js";
import { CliConnectionError } from "../../src/errors.js";
import { killIfAlive } from "../support/processes.js";
import { type StubServer, startStubServer } from "../support/stubServer.js";
import { createTempHome, type TempHome } from "../support/tempHome.js";

const FIXTURES_DIR = dirname(fileURLToPath(import.meta.url));
const FAKE_DAEMON_ENTRY = join(FIXTURES_DIR, "..", "support", "fixtures", "fake-daemon.mjs");

let home: TempHome | undefined;
let stub: StubServer | undefined;
/** 真的拉起过假服务时记下它的进程号，afterEach 里杀掉，不留后台进程。 */
let spawnedDaemonPid: number | undefined;

afterEach(async () => {
  await home?.cleanup();
  home = undefined;
  await stub?.close();
  stub = undefined;
  if (spawnedDaemonPid !== undefined) {
    killIfAlive(spawnedDaemonPid);
    spawnedDaemonPid = undefined;
  }
});

describe("findRunningDaemon", () => {
  it("daemon.json 不存在时返回 null", async () => {
    home = await createTempHome();
    const result = await findRunningDaemon(home.path);
    expect(result).toBeNull();
  });

  it("daemon.json 存在且探活成功时返回句柄", async () => {
    home = await createTempHome();
    stub = await startStubServer(() => ({ status: 200, body: { ok: true } }));
    const port = Number(new URL(stub.baseUrl).port);
    await home.writeDaemonJson({
      pid: process.pid,
      port,
      token: "test-token",
      startedAt: new Date().toISOString(),
      version: "0.0.0-test",
      home: home.path,
    });

    const result = await findRunningDaemon(home.path);
    expect(result).not.toBeNull();
    expect(result?.baseUrl).toBe(stub.baseUrl);
    expect(result?.token).toBe("test-token");
  });

  it("daemon.json 指向的端口连不上时返回 null", async () => {
    home = await createTempHome();
    // 先起一个桩服务拿到一个真的曾经监听过的端口，随即关掉，模拟「文件还在但服务已经不在了」。
    const closedStub = await startStubServer(() => ({ status: 200, body: { ok: true } }));
    const deadPort = Number(new URL(closedStub.baseUrl).port);
    await closedStub.close();

    await home.writeDaemonJson({
      pid: process.pid,
      port: deadPort,
      token: "test-token",
      startedAt: new Date().toISOString(),
      version: "0.0.0-test",
      home: home.path,
    });

    const result = await findRunningDaemon(home.path);
    expect(result).toBeNull();
  });

  it("daemon.json 内容不是合法形状时返回 null", async () => {
    home = await createTempHome();
    await writeFile(join(home.path, "daemon.json"), JSON.stringify({ pid: "不是数字" }), "utf8");

    const result = await findRunningDaemon(home.path);
    expect(result).toBeNull();
  });
});

describe("ensureDaemon", () => {
  it("已经有健康的服务时直接复用，不会尝试拉起新的", async () => {
    home = await createTempHome();
    stub = await startStubServer(() => ({ status: 200, body: { ok: true } }));
    const port = Number(new URL(stub.baseUrl).port);
    await home.writeDaemonJson({
      pid: process.pid,
      port,
      token: "existing-token",
      startedAt: new Date().toISOString(),
      version: "0.0.0-test",
      home: home.path,
    });

    // 故意把拉起入口指向不存在的脚本：如果 ensureDaemon 真的走了拉起分支，
    // 8 秒轮询超时后会抛错，而不是马上返回；能马上拿到句柄就说明走的是复用分支。
    const handle = await ensureDaemon(home.path, {
      FLEET_DAEMON_ENTRY: join(home.path, "does-not-exist.js"),
    });
    expect(handle.token).toBe("existing-token");
    expect(handle.baseUrl).toBe(stub.baseUrl);
  });

  it("没有服务时会拉起假服务并等到它探活成功", async () => {
    home = await createTempHome();
    const handle = await ensureDaemon(home.path, { FLEET_DAEMON_ENTRY: FAKE_DAEMON_ENTRY });
    spawnedDaemonPid = handle.info.pid;
    expect(handle.info.home).toBe(home.path);
    expect(handle.token).toBe("fake-daemon-token");

    const probedAgain = await findRunningDaemon(home.path);
    expect(probedAgain?.baseUrl).toBe(handle.baseUrl);
  });

  it("拉起失败（8 秒内探活始终不通）时抛 CliConnectionError，并提示日志路径", async () => {
    home = await createTempHome();
    const homePath = home.path;
    const brokenEntry = join(homePath, "does-not-exist.js");

    let caught: unknown;
    try {
      await ensureDaemon(homePath, { FLEET_DAEMON_ENTRY: brokenEntry });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CliConnectionError);
    expect(caught instanceof Error && caught.message.includes(daemonLogPath(homePath))).toBe(true);
  }, 15000);
});
