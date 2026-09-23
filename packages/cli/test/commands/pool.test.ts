import { type PoolView, ZERO_USAGE } from "@fleet/core";
import { afterEach, describe, expect, it } from "vitest";
import { runPoolCommand } from "../../src/commands/pool.js";
import { CliUsageError, EXIT_CODE } from "../../src/errors.js";
import {
  type CommandHarness,
  createCommandHarness,
  HARNESS_TOKEN,
} from "../support/commandHarness.js";
import { findRequest } from "../support/stubServer.js";

function fakePool(overrides: Partial<PoolView> = {}): PoolView {
  return {
    id: "dsf",
    label: "深度求索 flash",
    model: "mcgrox/deepseek-v4.1-flash",
    capacity: 10,
    perProjectCap: null,
    running: 0,
    queued: 0,
    slots: [],
    queuedByProject: [],
    health: { windowMinutes: 10, completed: 0, failed: 0, retrying: 0 },
    usageToday: ZERO_USAGE,
    ...overrides,
  };
}

let harness: CommandHarness | undefined;

afterEach(async () => {
  await harness?.cleanup();
  harness = undefined;
});

describe("runPoolCommand", () => {
  it("pool set --capacity：PATCH 请求带令牌和请求体，打印确认信息", async () => {
    const pool = fakePool({ capacity: 30 });
    harness = await createCommandHarness(() => ({ status: 200, body: pool }));

    const exitCode = await runPoolCommand(["set", "dsf", "--capacity", "30"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);

    const request = findRequest(harness.stub.requests, "PATCH", "/api/pools/dsf");
    expect(request.headers["x-fleet-token"]).toBe(HARNESS_TOKEN);
    const body = JSON.parse(request.body);
    expect(body.capacity).toBe(30);
    expect("perProjectCap" in body).toBe(false);

    expect(harness.deps.stdoutLines.join("\n")).toContain("容量 30");
  });

  it("pool set --per-project none：请求体带 perProjectCap: null", async () => {
    const pool = fakePool({ perProjectCap: null });
    harness = await createCommandHarness(() => ({ status: 200, body: pool }));
    await runPoolCommand(["set", "dsf", "--per-project", "none"], harness.deps);
    const request = findRequest(harness.stub.requests, "PATCH", "/api/pools/dsf");
    const body = JSON.parse(request.body);
    expect(body.perProjectCap).toBeNull();
    expect("capacity" in body).toBe(false);
  });

  it("--json 输出接口返回的 PoolView", async () => {
    const pool = fakePool({ capacity: 15 });
    harness = await createCommandHarness(() => ({ status: 200, body: pool }));
    const exitCode = await runPoolCommand(
      ["set", "dsf", "--capacity", "15", "--json"],
      harness.deps,
    );
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(JSON.parse(harness.deps.stdoutLines.join("\n"))).toEqual(pool);
  });

  it("既没有 --capacity 也没有 --per-project 时报用法错误，不发请求", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: fakePool() }));
    await expect(runPoolCommand(["set", "dsf"], harness.deps)).rejects.toThrow(CliUsageError);
    expect(harness.stub.requests.length).toBe(0);
  });

  it("没有池编号时报用法错误", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: fakePool() }));
    await expect(runPoolCommand(["set", "--capacity", "5"], harness.deps)).rejects.toThrow(
      CliUsageError,
    );
  });

  it("没有子命令或子命令不认识时报用法错误", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: fakePool() }));
    await expect(runPoolCommand([], harness.deps)).rejects.toThrow(CliUsageError);
    await expect(runPoolCommand(["delete", "dsf"], harness.deps)).rejects.toThrow(CliUsageError);
  });
});
