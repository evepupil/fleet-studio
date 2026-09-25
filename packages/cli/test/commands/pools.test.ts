import { type PoolView, type Snapshot, ZERO_USAGE } from "@fleet/core";
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
    channel: "mcgrox",
    modelName: "deepseek-v4.1-flash",
    priority: 1,
    enabled: true,
    capacity: 20,
    perProjectCap: 5,
    running: 3,
    queued: 2,
    slots: [],
    queuedByProject: [],
    health: { windowMinutes: 10, completed: 4, failed: 1, retrying: 0 },
    recent: { windowHours: 24, completed: 0, failed: 0, avgRunMs: null },
    usageToday: ZERO_USAGE,
    ...overrides,
  };
}

/** 桩服务只需要 sharedQueued 这一项，其余字段按 Snapshot 的契约填成空值。 */
function fakeSnapshot(sharedQueued: number): Snapshot {
  return {
    version: "0.0.0-test",
    serverTime: "2026-09-23T10:00:00.000Z",
    pools: [],
    sharedQueued,
    live: { slotsUsed: 0, slotsTotal: 0, running: 0, queued: 0, retrying: 0 },
    projects: [],
    workers: [],
    roles: [],
    configError: null,
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
    harness = await createCommandHarness((request) =>
      request.path === "/api/snapshot"
        ? { status: 200, body: fakeSnapshot(0) }
        : { status: 200, body: [pool] },
    );

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

  it("表头带优先级和状态，池按优先级顺序列出，停用的写停用", async () => {
    const first = fakePool({ id: "aaa", priority: 1, label: "第一个" });
    const second = fakePool({ id: "bbb", priority: 2, label: "第二个", enabled: false });
    // 故意让接口按倒序返回：命令应当按 priority 排回正序，而不是照抄返回顺序。
    harness = await createCommandHarness((request) =>
      request.path === "/api/snapshot"
        ? { status: 200, body: fakeSnapshot(0) }
        : { status: 200, body: [second, first] },
    );

    await runPoolsCommand([], harness.deps);
    const lines = harness.deps.stdoutLines;
    const header = lines[0] ?? "";
    expect(header).toContain("优先级");
    expect(header).toContain("状态");
    expect(header).toContain("最近10分钟完成/失败/重试中");

    const firstIndex = lines.findIndex((line) => line.includes("第一个"));
    const secondIndex = lines.findIndex((line) => line.includes("第二个"));
    expect(firstIndex).toBeGreaterThan(0);
    expect(firstIndex).toBeLessThan(secondIndex);
    expect(lines[firstIndex]).toContain("启用");
    expect(lines[secondIndex]).toContain("停用");
    expect(lines[firstIndex]).toMatch(/^\s*1\s/);
    expect(lines[secondIndex]).toMatch(/^\s*2\s/);
  });

  it("公共排队数大于 0 时在表格下面加一行汇总", async () => {
    harness = await createCommandHarness((request) =>
      request.path === "/api/snapshot"
        ? { status: 200, body: fakeSnapshot(3) }
        : { status: 200, body: [fakePool()] },
    );

    await runPoolsCommand([], harness.deps);
    expect(harness.deps.stdoutLines.at(-1)).toBe("公共排队 3 个（没点名，等任一池空位）");
  });

  it("公共排队数为 0 时不打那一行", async () => {
    harness = await createCommandHarness((request) =>
      request.path === "/api/snapshot"
        ? { status: 200, body: fakeSnapshot(0) }
        : { status: 200, body: [fakePool()] },
    );

    await runPoolsCommand([], harness.deps);
    expect(harness.deps.stdoutLines.some((line) => line.includes("公共排队"))).toBe(false);
  });

  it("perProjectCap 为 null 时显示不限", async () => {
    const pool = fakePool({ perProjectCap: null });
    harness = await createCommandHarness((request) =>
      request.path === "/api/snapshot"
        ? { status: 200, body: fakeSnapshot(0) }
        : { status: 200, body: [pool] },
    );
    await runPoolsCommand([], harness.deps);
    expect(harness.deps.stdoutLines.join("\n")).toContain("不限");
  });

  it("--json 原样输出接口返回的 JSON，不多问快照", async () => {
    const pool = fakePool();
    harness = await createCommandHarness(() => ({ status: 200, body: [pool] }));
    const exitCode = await runPoolsCommand(["--json"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(JSON.parse(harness.deps.stdoutLines.join("\n"))).toEqual([pool]);
    expect(harness.stub.requests.some((request) => request.path === "/api/snapshot")).toBe(false);
  });
});
