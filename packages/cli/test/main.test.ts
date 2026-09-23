import type { RoleView } from "@fleet/core";
import { afterEach, describe, expect, it } from "vitest";
import { EXIT_CODE } from "../src/errors.js";
import { runFleetCli } from "../src/main.js";
import { type CommandHarness, createCommandHarness } from "./support/commandHarness.js";
import { createFakeDeps } from "./support/deps.js";
import { createTempHome, type TempHome } from "./support/tempHome.js";

let harness: CommandHarness | undefined;
let home: TempHome | undefined;

afterEach(async () => {
  await harness?.cleanup();
  harness = undefined;
  await home?.cleanup();
  home = undefined;
});

describe("runFleetCli 分发与用法", () => {
  it("没有子命令时报用法错误，退出码 3", async () => {
    const deps = createFakeDeps();
    const exitCode = await runFleetCli([], deps);
    expect(exitCode).toBe(EXIT_CODE.usage);
    expect(deps.stderrLines.length).toBeGreaterThan(0);
  });

  it("--help 打印全部子命令列表，退出码 0", async () => {
    const deps = createFakeDeps();
    const exitCode = await runFleetCli(["--help"], deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    const output = deps.stdoutLines.join("\n");
    expect(output).toContain("run");
    expect(output).toContain("daemon");
  });

  it("不认识的子命令报用法错误，退出码 3", async () => {
    const deps = createFakeDeps();
    const exitCode = await runFleetCli(["nope"], deps);
    expect(exitCode).toBe(EXIT_CODE.usage);
    expect(deps.stderrLines.some((line) => line.includes("nope"))).toBe(true);
  });
});

describe("runFleetCli 端到端：正常分发到子命令", () => {
  it("fleet roles 能跑通完整链路：解析、找服务、调接口、格式化输出", async () => {
    const roles: RoleView[] = [{ id: "worker", label: "实现", description: "写代码" }];
    harness = await createCommandHarness(() => ({ status: 200, body: roles }));
    const exitCode = await runFleetCli(["roles"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(harness.deps.stdoutLines.join("\n")).toContain("worker");
  });
});

describe("runFleetCli 统一错误映射", () => {
  it("子命令抛用法错误时退出码 3，错误信息写到 stderr", async () => {
    harness = await createCommandHarness(() => ({ status: 201, body: {} }));
    const exitCode = await runFleetCli(["run"], harness.deps); // 没有任务正文
    expect(exitCode).toBe(EXIT_CODE.usage);
    expect(harness.deps.stderrLines.length).toBeGreaterThan(0);
  });

  it("接口返回结构化错误时退出码 1，错误信息写到 stderr", async () => {
    harness = await createCommandHarness(() => ({
      status: 404,
      body: { error: { code: "not_found", message: "苦工不存在" } },
    }));
    const exitCode = await runFleetCli(["show", "nope"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.failure);
    expect(harness.deps.stderrLines.some((line) => line.includes("苦工不存在"))).toBe(true);
  });

  it("服务连不上且拉起也失败时退出码 3", async () => {
    home = await createTempHome();
    const deps = createFakeDeps({
      env: {
        FLEET_HOME: home.path,
        FLEET_DAEMON_ENTRY: "Z:\\__fleet_test_does_not_exist__\\entry.js",
      },
    });
    const exitCode = await runFleetCli(["ps"], deps);
    expect(exitCode).toBe(EXIT_CODE.usage);
    expect(deps.stderrLines.some((line) => line.includes("日志"))).toBe(true);
  }, 15000);
});
