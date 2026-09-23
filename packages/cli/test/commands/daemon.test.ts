import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runDaemonCommand } from "../../src/commands/daemon.js";
import { CliUsageError, EXIT_CODE } from "../../src/errors.js";
import {
  type CommandHarness,
  createCommandHarness,
  HARNESS_TOKEN,
} from "../support/commandHarness.js";
import { createFakeDeps, type FakeDeps } from "../support/deps.js";
import { killIfAlive } from "../support/processes.js";
import { type StubServer, startStubServer } from "../support/stubServer.js";
import { createTempHome, type TempHome } from "../support/tempHome.js";

const FAKE_DAEMON_ENTRY = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "support",
  "fixtures",
  "fake-daemon.mjs",
);

let harness: CommandHarness | undefined;
let home: TempHome | undefined;
let stub: StubServer | undefined;
/** 真的拉起过假服务时记下它的进程号，afterEach 里杀掉，不留后台进程。 */
let spawnedDaemonPid: number | undefined;

afterEach(async () => {
  // 先杀假服务进程再删数据目录：缺陷 10 修好之后这个目录是子进程的 cwd，顺序反了
  // 在 Windows 上会删不掉（EBUSY）。
  if (spawnedDaemonPid !== undefined) {
    killIfAlive(spawnedDaemonPid);
    spawnedDaemonPid = undefined;
  }
  await harness?.cleanup();
  harness = undefined;
  await home?.cleanup();
  home = undefined;
  await stub?.close();
  stub = undefined;
});

describe("runDaemonCommand status", () => {
  it("服务在运行时输出进程号、端口、启动时间、数据目录、版本", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: { ok: true } }));
    const exitCode = await runDaemonCommand(["status"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    const output = harness.deps.stdoutLines.join("\n");
    expect(output).toContain(`进程号：${process.pid}`);
    expect(output).toContain("端口：");
    expect(output).toContain(`数据目录：${harness.home.path}`);
    expect(output).toContain("版本：0.0.0-test");
  });

  it("服务没运行时输出服务未运行，退出码 0", async () => {
    home = await createTempHome();
    const deps = createFakeDeps({ env: { FLEET_HOME: home.path } });
    const exitCode = await runDaemonCommand(["status"], deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(deps.stdoutLines).toContain("服务未运行");
  });

  it("--json 不泄露令牌，只给 running/pid/port 等字段", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: { ok: true } }));
    const exitCode = await runDaemonCommand(["status", "--json"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    const parsed = JSON.parse(harness.deps.stdoutLines.join("\n"));
    expect(parsed.running).toBe(true);
    expect(parsed.token).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain(HARNESS_TOKEN);
  });
});

describe("runDaemonCommand start", () => {
  it("服务没运行时拉起假服务，输出服务已启动", async () => {
    home = await createTempHome();
    const deps = createFakeDeps({
      env: { FLEET_HOME: home.path, FLEET_DAEMON_ENTRY: FAKE_DAEMON_ENTRY },
    });
    const exitCode = await runDaemonCommand(["start"], deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(deps.stdoutLines[0]).toBe("服务已启动");

    const daemonInfoText = await readFile(join(home.path, "daemon.json"), "utf8");
    spawnedDaemonPid = JSON.parse(daemonInfoText).pid;
  });

  it("服务已经在运行时不重复拉起，输出服务已在运行", async () => {
    // 故意指向不存在的拉起入口：如果命令真的尝试拉起，会等 8 秒后报错，而不是立刻返回。
    harness = await createCommandHarness(() => ({ status: 200, body: { ok: true } }), {
      env: { FLEET_DAEMON_ENTRY: "Z:\\__fleet_test_does_not_exist__\\entry.js" },
    });
    const exitCode = await runDaemonCommand(["start"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(harness.deps.stdoutLines[0]).toBe("服务已在运行");
  });
});

describe("runDaemonCommand stop", () => {
  it("服务没运行时输出服务未运行，退出码 0", async () => {
    home = await createTempHome();
    const deps = createFakeDeps({ env: { FLEET_HOME: home.path } });
    const exitCode = await runDaemonCommand(["stop"], deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(deps.stdoutLines).toContain("服务未运行");
  });

  it("服务在运行时调用 /api/shutdown（带令牌）并等到端口不再响应", async () => {
    home = await createTempHome();
    stub = await startStubServer((request) => {
      if (request.path === "/api/health") {
        return { status: 200, body: { ok: true } };
      }
      if (request.path === "/api/shutdown") {
        // 响应先发出去，之后再真的关掉服务，模拟「收到关停指令，收尾后退出」。
        setTimeout(() => {
          void stub?.close();
        }, 10);
        return { status: 200, body: { ok: true } };
      }
      throw new Error(`意外请求：${request.method} ${request.path}`);
    });
    const port = Number(new URL(stub.baseUrl).port);
    await home.writeDaemonJson({
      pid: process.pid,
      port,
      token: "stop-test-token",
      startedAt: new Date().toISOString(),
      version: "0.0.0-test",
      home: home.path,
    });

    const deps: FakeDeps = createFakeDeps({ env: { FLEET_HOME: home.path } });
    const exitCode = await runDaemonCommand(["stop"], deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(deps.stdoutLines).toContain("服务已停止");
    stub = undefined; // 已经在上面自己关掉了，afterEach 不用再关一次
  });
});

describe("runDaemonCommand 用法错误", () => {
  it("没有子命令时报用法错误", async () => {
    home = await createTempHome();
    const deps = createFakeDeps({ env: { FLEET_HOME: home.path } });
    await expect(runDaemonCommand([], deps)).rejects.toThrow(CliUsageError);
  });

  it("子命令不认识时报用法错误", async () => {
    home = await createTempHome();
    const deps = createFakeDeps({ env: { FLEET_HOME: home.path } });
    await expect(runDaemonCommand(["reload"], deps)).rejects.toThrow(CliUsageError);
  });
});
