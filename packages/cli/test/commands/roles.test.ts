import type { RoleView } from "@fleet/core";
import { afterEach, describe, expect, it } from "vitest";
import { runRolesCommand } from "../../src/commands/roles.js";
import { EXIT_CODE } from "../../src/errors.js";
import { type CommandHarness, createCommandHarness } from "../support/commandHarness.js";
import { findRequest } from "../support/stubServer.js";

const ROLES: RoleView[] = [
  { id: "worker", label: "实现", description: "写代码、修 bug" },
  { id: "tester", label: "测试", description: "跑测试、找问题" },
];

let harness: CommandHarness | undefined;

afterEach(async () => {
  await harness?.cleanup();
  harness = undefined;
});

describe("runRolesCommand", () => {
  it("列出角色：请求不需要令牌，表格带编号中文名说明", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: ROLES }));
    const exitCode = await runRolesCommand([], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);

    const request = findRequest(harness.stub.requests, "GET", "/api/roles");
    expect(request.headers["x-fleet-token"]).toBeUndefined();

    const output = harness.deps.stdoutLines.join("\n");
    expect(output).toContain("worker");
    expect(output).toContain("实现");
    expect(output).toContain("写代码、修 bug");
    expect(output).toContain("tester");
  });

  it("--json 原样输出接口返回的 JSON", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: ROLES }));
    const exitCode = await runRolesCommand(["--json"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(JSON.parse(harness.deps.stdoutLines.join("\n"))).toEqual(ROLES);
  });
});
