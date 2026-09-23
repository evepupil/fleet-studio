import { afterEach, describe, expect, it } from "vitest";
import { runPsCommand } from "../../src/commands/ps.js";
import { EXIT_CODE } from "../../src/errors.js";
import { type CommandHarness, createCommandHarness } from "../support/commandHarness.js";
import { fakeWorker } from "../support/fixtures.js";
import { findRequest } from "../support/stubServer.js";

let harness: CommandHarness | undefined;

afterEach(async () => {
  await harness?.cleanup();
  harness = undefined;
});

describe("runPsCommand", () => {
  it("默认按项目过滤：请求带 project 查询参数，不需要令牌", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: [] }));
    const exitCode = await runPsCommand(["--project", "C:\\proj"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);

    const request = findRequest(harness.stub.requests, "GET", "/api/workers");
    expect(request.query.get("project")).toBe("C:\\proj");
    expect(request.headers["x-fleet-token"]).toBeUndefined();
  });

  it("--all 时不带 project 查询参数", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: [] }));
    await runPsCommand(["--all"], harness.deps);
    const request = findRequest(harness.stub.requests, "GET", "/api/workers");
    expect(request.query.has("project")).toBe(false);
  });

  it("表格列出编号、状态、角色、池、时长、标题、最近活动，进行中的排前面", async () => {
    const running = fakeWorker({
      id: "aaaaa1",
      status: "running",
      startedAt: "2026-09-23T09:57:00.000Z",
      activity: "bash · pnpm test",
      createdAt: "2026-09-23T09:00:00.000Z",
    });
    const completed = fakeWorker({
      id: "bbbbb2",
      status: "completed",
      startedAt: "2026-09-23T09:00:00.000Z",
      endedAt: "2026-09-23T09:10:00.000Z",
      createdAt: "2026-09-23T08:00:00.000Z",
    });
    harness = await createCommandHarness(() => ({ status: 200, body: [completed, running] }));

    await runPsCommand(["--all"], harness.deps);
    const lines = harness.deps.stdoutLines;
    const runningLineIndex = lines.findIndex((line) => line.includes("aaaaa1"));
    const completedLineIndex = lines.findIndex((line) => line.includes("bbbbb2"));
    expect(runningLineIndex).toBeGreaterThan(0);
    expect(runningLineIndex).toBeLessThan(completedLineIndex);
    expect(lines[runningLineIndex]).toContain("bash · pnpm test");
    expect(lines[runningLineIndex]).toContain("工作中");
    expect(lines[completedLineIndex]).toContain("已完成");
  });

  it("排序规则（缺陷 5）：工作中按开跑时间、排队中按位置、已结束按结束时间倒序排在已结束组最前面", async () => {
    const runningLate = fakeWorker({
      id: "aaaaa1",
      status: "running",
      startedAt: "2026-09-23T09:58:00.000Z",
    });
    const runningEarly = fakeWorker({
      id: "aaaaa2",
      status: "running",
      startedAt: "2026-09-23T09:50:00.000Z",
    });
    const queuedThird = fakeWorker({ id: "qqqqq1", status: "queued", queuePosition: 3 });
    const queuedFirst = fakeWorker({ id: "qqqqq2", status: "queued", queuePosition: 1 });
    // 故意用字母序和结束时间相反的编号，复现「原来按编号字母序排列」的缺陷现象。
    const endedOldest = fakeWorker({
      id: "w2uevt",
      status: "completed",
      endedAt: "2026-09-23T08:00:00.000Z",
    });
    const endedNewest = fakeWorker({
      id: "wvw634",
      status: "completed",
      endedAt: "2026-09-23T09:59:00.000Z",
    });
    harness = await createCommandHarness(() => ({
      status: 200,
      body: [endedOldest, queuedThird, runningLate, endedNewest, runningEarly, queuedFirst],
    }));

    await runPsCommand(["--all"], harness.deps);
    const ids = harness.deps.stdoutLines
      .map((line) => /^(\S+)/.exec(line)?.[1])
      .filter((id): id is string => id !== undefined && id !== "编号");

    expect(ids).toEqual(["aaaaa2", "aaaaa1", "qqqqq2", "qqqqq1", "wvw634", "w2uevt"]);
  });

  it("--json 原样输出接口返回的 JSON 数组", async () => {
    const worker = fakeWorker();
    harness = await createCommandHarness(() => ({ status: 200, body: [worker] }));
    const exitCode = await runPsCommand(["--all", "--json"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(JSON.parse(harness.deps.stdoutLines.join("\n"))).toEqual([worker]);
  });
});
