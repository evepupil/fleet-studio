import { TOKEN_HEADER } from "@fleet/core";
import { afterEach, describe, expect, it } from "vitest";
import { runSendCommand } from "../../src/commands/send.js";
import { CliUsageError, EXIT_CODE } from "../../src/errors.js";
import {
  type CommandHarness,
  createCommandHarness,
  HARNESS_TOKEN,
} from "../support/commandHarness.js";
import { fakeDetail, fakeRun, fakeWorker } from "../support/fixtures.js";
import { findRequest } from "../support/stubServer.js";

let harness: CommandHarness | undefined;

afterEach(async () => {
  await harness?.cleanup();
  harness = undefined;
});

describe("runSendCommand", () => {
  it("续接成功：请求路径、令牌、请求体都对，打印状态行，退出码 0", async () => {
    const worker = fakeWorker({ status: "queued", runSeq: 2 });
    harness = await createCommandHarness(() => ({ status: 200, body: { worker } }));

    const exitCode = await runSendCommand(
      [worker.id, "继续", "改一下命名", "--timeout", "20"],
      harness.deps,
    );
    expect(exitCode).toBe(EXIT_CODE.ok);

    const request = findRequest(
      harness.stub.requests,
      "POST",
      `/api/workers/${worker.id}/messages`,
    );
    expect(request.headers[TOKEN_HEADER]).toBe(HARNESS_TOKEN);
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({ prompt: "继续 改一下命名", timeoutMin: 20 });

    expect(harness.deps.stdoutLines.some((line) => line.includes("排队中"))).toBe(true);
  });

  it("--json 输出接口返回的 worker JSON", async () => {
    const worker = fakeWorker({ runSeq: 2 });
    harness = await createCommandHarness(() => ({ status: 200, body: { worker } }));
    const exitCode = await runSendCommand([worker.id, "继续", "--json"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(JSON.parse(harness.deps.stdoutLines.join("\n"))).toEqual({ worker });
  });

  it("--wait 续接完接着等", async () => {
    const worker = fakeWorker({ status: "queued", runSeq: 2 });
    const doneWorker: typeof worker = { ...worker, status: "completed" };

    harness = await createCommandHarness((request) => {
      if (request.method === "POST" && request.path === `/api/workers/${worker.id}/messages`) {
        return { status: 200, body: { worker } };
      }
      if (request.path === "/api/wait") {
        return { status: 200, body: { done: [doneWorker], pending: [], timedOut: false } };
      }
      if (request.path === `/api/workers/${worker.id}`) {
        return {
          status: 200,
          body: fakeDetail(doneWorker, [fakeRun({ seq: 2, finalText: "SUMMARY: 好了" })]),
        };
      }
      throw new Error(`意外请求：${request.method} ${request.path}`);
    });

    const exitCode = await runSendCommand([worker.id, "继续", "--wait"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(harness.deps.stdoutLines.some((line) => line.includes("SUMMARY: 好了"))).toBe(true);
  });

  it("--wait --brief 续接完接着等但不打印回报原文（缺陷 2：send 现在也认 --brief）", async () => {
    const worker = fakeWorker({ status: "queued", runSeq: 2 });
    const doneWorker: typeof worker = { ...worker, status: "completed" };

    harness = await createCommandHarness((request) => {
      if (request.method === "POST" && request.path === `/api/workers/${worker.id}/messages`) {
        return { status: 200, body: { worker } };
      }
      if (request.path === "/api/wait") {
        return { status: 200, body: { done: [doneWorker], pending: [], timedOut: false } };
      }
      throw new Error(`意外请求：${request.method} ${request.path}`);
    });

    const exitCode = await runSendCommand([worker.id, "继续", "--wait", "--brief"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(
      harness.stub.requests.some((request) => request.path === `/api/workers/${worker.id}`),
    ).toBe(false);
  });

  it("没有给苦工编号时报用法错误", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: {} }));
    await expect(runSendCommand([], harness.deps)).rejects.toThrow(CliUsageError);
    expect(harness.stub.requests.length).toBe(0);
  });

  it("给了编号但没有追加指令正文时报用法错误", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: {} }));
    await expect(runSendCommand(["w7k2mq"], harness.deps)).rejects.toThrow(CliUsageError);
  });
});
