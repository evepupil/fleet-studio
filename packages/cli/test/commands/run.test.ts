import { TOKEN_HEADER, type WorkerSummary, ZERO_USAGE } from "@fleet/core";
import { afterEach, describe, expect, it } from "vitest";
import { runRunCommand } from "../../src/commands/run.js";
import { CliUsageError, EXIT_CODE } from "../../src/errors.js";
import {
  type CommandHarness,
  createCommandHarness,
  HARNESS_TOKEN,
} from "../support/commandHarness.js";
import { findRequest } from "../support/stubServer.js";

function fakeWorker(overrides: Partial<WorkerSummary> = {}): WorkerSummary {
  return {
    id: "w7k2mq",
    projectKey: "c:\\code\\demo",
    cwd: "C:\\code\\demo",
    title: "写代码",
    role: "worker",
    roleLabel: "实现",
    runtime: "pi",
    poolId: "dsf",
    model: "mcgrox/deepseek-v4.1-flash",
    status: "queued",
    failReason: null,
    errorMessage: null,
    runSeq: 1,
    createdAt: "2026-09-23T09:59:59.000Z",
    queuedAt: "2026-09-23T09:59:59.000Z",
    startedAt: null,
    endedAt: null,
    lastActivityAt: null,
    activity: null,
    retry: null,
    verdict: null,
    usage: ZERO_USAGE,
    queuePosition: 1,
    ...overrides,
  };
}

let harness: CommandHarness | undefined;

afterEach(async () => {
  await harness?.cleanup();
  harness = undefined;
});

describe("runRunCommand", () => {
  it("派活成功：请求路径、令牌、请求体都对，输出编号和状态行，退出码 0", async () => {
    const worker = fakeWorker();
    harness = await createCommandHarness(() => ({ status: 201, body: { worker } }));

    const exitCode = await runRunCommand(
      [
        "写代码",
        "改 bug",
        "--project",
        "C:\\proj",
        "--cwd",
        "C:\\proj\\sub",
        "--pool",
        "dsf",
        "--role",
        "worker",
      ],
      harness.deps,
    );

    expect(exitCode).toBe(EXIT_CODE.ok);
    const request = findRequest(harness.stub.requests, "POST", "/api/workers");
    expect(request.headers[TOKEN_HEADER]).toBe(HARNESS_TOKEN);
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      projectPath: "C:\\proj",
      cwd: "C:\\proj\\sub",
      prompt: "写代码 改 bug",
      pool: "dsf",
      role: "worker",
    });

    expect(harness.deps.stdoutLines[0]).toBe("w7k2mq");
    expect(harness.deps.stdoutLines[1]).toContain("排队中");
  });

  it("--json 时原样输出接口返回的 worker JSON", async () => {
    const worker = fakeWorker();
    harness = await createCommandHarness(() => ({ status: 201, body: { worker } }));

    const exitCode = await runRunCommand(["写代码", "--json"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(JSON.parse(harness.deps.stdoutLines.join("\n"))).toEqual({ worker });
  });

  it("--queue-timeout none 时请求体里带 queueTimeoutMin: null", async () => {
    const worker = fakeWorker();
    harness = await createCommandHarness(() => ({ status: 201, body: { worker } }));
    await runRunCommand(["写代码", "--queue-timeout", "none"], harness.deps);
    const request = findRequest(harness.stub.requests, "POST", "/api/workers");
    const body = JSON.parse(request.body);
    expect(body.queueTimeoutMin).toBeNull();
  });

  it("没有任务正文时报用法错误", async () => {
    harness = await createCommandHarness(() => ({ status: 201, body: { worker: fakeWorker() } }));
    await expect(runRunCommand([], harness.deps)).rejects.toThrow(CliUsageError);
    expect(harness.stub.requests.length).toBe(0);
  });

  it("--runtime 传非法值时报用法错误，不会发出请求", async () => {
    harness = await createCommandHarness(() => ({ status: 201, body: { worker: fakeWorker() } }));
    await expect(runRunCommand(["写代码", "--runtime", "claude"], harness.deps)).rejects.toThrow(
      CliUsageError,
    );
    expect(harness.stub.requests.length).toBe(0);
  });

  it("--wait 派完接着等，等到完成后打印回报并返回等待的退出码", async () => {
    const queuedWorker = fakeWorker({ status: "queued" });
    const doneWorker = fakeWorker({
      status: "completed",
      startedAt: "2026-09-23T10:00:00.000Z",
      endedAt: "2026-09-23T10:00:05.000Z",
      queuePosition: null,
    });

    harness = await createCommandHarness((request) => {
      if (request.method === "POST" && request.path === "/api/workers") {
        return { status: 201, body: { worker: queuedWorker } };
      }
      if (request.path === "/api/wait") {
        return { status: 200, body: { done: [doneWorker], pending: [], timedOut: false } };
      }
      if (request.path === `/api/workers/${doneWorker.id}`) {
        return {
          status: 200,
          body: {
            summary: doneWorker,
            projectPath: "C:\\proj",
            sessionRef: null,
            thinking: null,
            runs: [
              {
                id: `${doneWorker.id}.1`,
                seq: 1,
                status: "completed",
                failReason: null,
                errorMessage: null,
                prompt: "写代码",
                queuedAt: doneWorker.queuedAt,
                startedAt: doneWorker.startedAt,
                endedAt: doneWorker.endedAt,
                exitCode: 0,
                usage: ZERO_USAGE,
                finalText: "SUMMARY: 完成了",
                report: null,
              },
            ],
          },
        };
      }
      throw new Error(`意外的请求：${request.method} ${request.path}`);
    });

    const exitCode = await runRunCommand(["写代码", "--wait"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(harness.deps.stdoutLines.some((line) => line.includes("已完成"))).toBe(true);
    expect(harness.deps.stdoutLines.some((line) => line.includes("SUMMARY: 完成了"))).toBe(true);
  });

  it("--wait --brief 派完接着等但不打印回报原文（缺陷 2：run 现在也认 --brief）", async () => {
    const queuedWorker = fakeWorker({ status: "queued" });
    const doneWorker = fakeWorker({ status: "completed", queuePosition: null });

    harness = await createCommandHarness((request) => {
      if (request.method === "POST" && request.path === "/api/workers") {
        return { status: 201, body: { worker: queuedWorker } };
      }
      if (request.path === "/api/wait") {
        return { status: 200, body: { done: [doneWorker], pending: [], timedOut: false } };
      }
      // 没有 /api/workers/:id 这一条：--brief 应该跳过取详情，命中这里说明没生效。
      throw new Error(`意外的请求：${request.method} ${request.path}`);
    });

    const exitCode = await runRunCommand(["写代码", "--wait", "--brief"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(
      harness.stub.requests.some((request) => request.path === `/api/workers/${doneWorker.id}`),
    ).toBe(false);
  });
});
