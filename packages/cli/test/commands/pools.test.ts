import { type PoolView, ZERO_USAGE } from "@fleet/core";
import { afterEach, describe, expect, it } from "vitest";
import { runPoolsCommand } from "../../src/commands/pools.js";
import { EXIT_CODE } from "../../src/errors.js";
import { type CommandHarness, createCommandHarness } from "../support/commandHarness.js";
import { findRequest } from "../support/stubServer.js";

function fakePool(overrides: Partial<PoolView> = {}): PoolView {
  return {
    id: "dsf",
    label: "深度求索 flash",
    model: "mcgrox/deepseek-v4.1-flash",
    capacity: 20,
    perProjectCap: 5,
    running: 3,
    queued: 2,
    slots: [],
    queuedByProject: [],
    health: { windowMinutes: 10, completed: 4, failed: 1, retrying: 0 },
    usageToday: ZERO_USAGE,
    ...overrides,
  };
}

let harness: CommandHarness | undefined;

afterEach(async () => {
  await harness?.cleanup();
  harness = undefined;
});

describe("runPoolsCommand", () => {
  it("列出池：请求不需要令牌，表格带容量、排队数、单项目上限和健康数据", async () => {
    const pool = fakePool();
    harness = await createCommandHarness(() => ({ status: 200, body: [pool] }));

    const exitCode = await runPoolsCommand([], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);

    const request = findRequest(harness.stub.requests, "GET", "/api/pools");
    expect(request.headers["x-fleet-token"]).toBeUndefined();

    const output = harness.deps.stdoutLines.join("\n");
    expect(output).toContain("dsf");
    expect(output).toContain("深度求索 flash");
    expect(output).toContain("3/20");
    expect(output).toContain("4/1/0");
  });

  it("perProjectCap 为 null 时显示不限", async () => {
    const pool = fakePool({ perProjectCap: null });
    harness = await createCommandHarness(() => ({ status: 200, body: [pool] }));
    await runPoolsCommand([], harness.deps);
    expect(harness.deps.stdoutLines.join("\n")).toContain("不限");
  });

  it("--json 原样输出接口返回的 JSON", async () => {
    const pool = fakePool();
    harness = await createCommandHarness(() => ({ status: 200, body: [pool] }));
    const exitCode = await runPoolsCommand(["--json"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(JSON.parse(harness.deps.stdoutLines.join("\n"))).toEqual([pool]);
  });
});
