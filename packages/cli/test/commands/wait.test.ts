import { TOKEN_HEADER } from "@fleet/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  computePerCallTimeoutSec,
  computeWaitRequestTimeoutMs,
  runWaitCommand,
} from "../../src/commands/wait.js";
import { CliUsageError, EXIT_CODE } from "../../src/errors.js";
import { type CommandHarness, createCommandHarness } from "../support/commandHarness.js";
import { fakeDetail, fakeRun, fakeWorker } from "../support/fixtures.js";
import { findRequest } from "../support/stubServer.js";

describe("computePerCallTimeoutSec / computeWaitRequestTimeoutMs（缺陷 7 的核心公式）", () => {
  it("单次 /api/wait 让服务端等待的秒数随剩余预算变化，且封顶 60 秒", () => {
    expect(computePerCallTimeoutSec(undefined)).toBe(60);
    expect(computePerCallTimeoutSec(5000)).toBe(5);
    expect(computePerCallTimeoutSec(200)).toBe(1); // 向上取整且至少 1 秒
    expect(computePerCallTimeoutSec(120_000)).toBe(60); // 封顶在 WAIT_MAX_SECONDS
  });

  it("客户端超时留 15 秒余量：timeoutSec 用满 60 秒时也远大于旧的固定 30 秒", () => {
    expect(computeWaitRequestTimeoutMs(2)).toBe(17_000);
    expect(computeWaitRequestTimeoutMs(60)).toBe(75_000);
    // 这正是缺陷 7 的核心：旧实现固定用 30_000ms，服务端按 60 秒长轮询时客户端会先掐断。
    expect(computeWaitRequestTimeoutMs(60)).toBeGreaterThan(30_000);
  });
});

let harness: CommandHarness | undefined;

afterEach(async () => {
  await harness?.cleanup();
  harness = undefined;
});

describe("runWaitCommand", () => {
  it("一轮就完成：打印状态行和回报原文，退出码 0", async () => {
    const doneWorker = fakeWorker({ status: "completed" });
    harness = await createCommandHarness((request) => {
      if (request.path === "/api/wait") {
        return { status: 200, body: { done: [doneWorker], pending: [], timedOut: false } };
      }
      if (request.path === `/api/workers/${doneWorker.id}`) {
        return {
          status: 200,
          body: fakeDetail(doneWorker, [fakeRun({ finalText: "SUMMARY: 都好" })]),
        };
      }
      throw new Error(`意外请求：${request.method} ${request.path}`);
    });

    const exitCode = await runWaitCommand([doneWorker.id], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);

    const waitRequest = findRequest(harness.stub.requests, "GET", "/api/wait");
    expect(waitRequest.headers[TOKEN_HEADER]).toBeUndefined(); // /api/wait 不需要令牌
    expect(waitRequest.query.get("ids")).toBe(doneWorker.id);
    expect(waitRequest.query.get("mode")).toBe("all");

    expect(harness.deps.stdoutLines.some((line) => line.includes("已完成"))).toBe(true);
    expect(harness.deps.stdoutLines.some((line) => line.includes("SUMMARY: 都好"))).toBe(true);
  });

  it("多轮等待：第一次还没结束，第二次才结束", async () => {
    const workerId = "w7k2mq";
    const doneWorker = fakeWorker({ id: workerId, status: "completed" });
    let waitCallCount = 0;

    harness = await createCommandHarness((request) => {
      if (request.path === "/api/wait") {
        waitCallCount += 1;
        if (waitCallCount === 1) {
          return { status: 200, body: { done: [], pending: [workerId], timedOut: false } };
        }
        return { status: 200, body: { done: [doneWorker], pending: [], timedOut: false } };
      }
      if (request.path === `/api/workers/${workerId}`) {
        return { status: 200, body: fakeDetail(doneWorker) };
      }
      throw new Error(`意外请求：${request.method} ${request.path}`);
    });

    const exitCode = await runWaitCommand([workerId, "--timeout", "10"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(waitCallCount).toBe(2);
  });

  it("总超时到了还没结束：退出码 2，并打印超时汇总和每个没结束苦工的状态行（缺陷 4）", async () => {
    const workerId = "w7k2mq";
    const stillRunning = fakeWorker({ id: workerId, status: "running" });
    harness = await createCommandHarness((request) => {
      if (request.path === "/api/wait") {
        return { status: 200, body: { done: [], pending: [workerId], timedOut: true } };
      }
      if (request.path === `/api/workers/${workerId}`) {
        return { status: 200, body: fakeDetail(stillRunning) };
      }
      throw new Error(`意外请求：${request.method} ${request.path}`);
    });

    const exitCode = await runWaitCommand([workerId, "--timeout", "0.3"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.timeout);
    expect(harness.deps.stdoutLines).toContain(`等待超时，还有 1 个苦工没结束：${workerId}`);
    expect(
      harness.deps.stdoutLines.some((line) => line.startsWith(workerId) && line.includes("工作中")),
    ).toBe(true);
  }, 10000);

  it("超时提示不影响 --json：--json 模式下不额外打印超时汇总文字", async () => {
    const workerId = "w7k2mq";
    harness = await createCommandHarness((request) => {
      if (request.path === "/api/wait") {
        return { status: 200, body: { done: [], pending: [workerId], timedOut: true } };
      }
      throw new Error(`意外请求：${request.method} ${request.path}`);
    });

    const exitCode = await runWaitCommand([workerId, "--timeout", "0.3", "--json"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.timeout);
    const parsed = JSON.parse(harness.deps.stdoutLines.join("\n"));
    expect(parsed).toEqual({ done: [], pending: [workerId], timedOut: true });
  }, 10000);

  it("失败的苦工：打印失败原因，退出码 1", async () => {
    const failedWorker = fakeWorker({
      status: "failed",
      failReason: "timeout",
      errorMessage: "运行超过 30 分钟",
    });
    harness = await createCommandHarness((request) => {
      if (request.path === "/api/wait") {
        return { status: 200, body: { done: [failedWorker], pending: [], timedOut: false } };
      }
      if (request.path === `/api/workers/${failedWorker.id}`) {
        return {
          status: 200,
          body: fakeDetail(failedWorker, [fakeRun({ status: "failed", finalText: null })]),
        };
      }
      throw new Error(`意外请求：${request.method} ${request.path}`);
    });

    const exitCode = await runWaitCommand([failedWorker.id], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.failure);
    expect(
      harness.deps.stdoutLines.some(
        (line) => line.includes("运行超时") && line.includes("运行超过 30 分钟"),
      ),
    ).toBe(true);
  });

  it("--brief 不请求详情、不打印回报原文", async () => {
    const doneWorker = fakeWorker({ status: "completed" });
    harness = await createCommandHarness((request) => {
      if (request.path === "/api/wait") {
        return { status: 200, body: { done: [doneWorker], pending: [], timedOut: false } };
      }
      throw new Error(`意外请求：${request.method} ${request.path}`);
    });

    const exitCode = await runWaitCommand([doneWorker.id, "--brief"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(
      harness.stub.requests.some((request) => request.path === `/api/workers/${doneWorker.id}`),
    ).toBe(false);
  });

  it("--any 只要有一个完成就结束", async () => {
    const workerA = fakeWorker({ id: "aaaaa1", status: "completed" });
    harness = await createCommandHarness((request) => {
      if (request.path === "/api/wait") {
        expect(request.query.get("mode")).toBe("any");
        return { status: 200, body: { done: [workerA], pending: ["bbbbb2"], timedOut: false } };
      }
      if (request.path === `/api/workers/${workerA.id}`) {
        return { status: 200, body: fakeDetail(workerA) };
      }
      throw new Error(`意外请求：${request.method} ${request.path}`);
    });

    const exitCode = await runWaitCommand(["aaaaa1", "bbbbb2", "--any"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
  });

  it("--json 只输出一份聚合结果 JSON", async () => {
    const doneWorker = fakeWorker({ status: "completed" });
    harness = await createCommandHarness((request) => {
      if (request.path === "/api/wait") {
        return { status: 200, body: { done: [doneWorker], pending: [], timedOut: false } };
      }
      throw new Error(`意外请求：${request.method} ${request.path}`);
    });

    const exitCode = await runWaitCommand([doneWorker.id, "--json"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(
      harness.stub.requests.some((request) => request.path === `/api/workers/${doneWorker.id}`),
    ).toBe(false);
    const parsed = JSON.parse(harness.deps.stdoutLines.join("\n"));
    expect(parsed).toEqual({ done: [doneWorker], pending: [], timedOut: false });
  });

  it("没有给编号时报用法错误", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: {} }));
    await expect(runWaitCommand([], harness.deps)).rejects.toThrow(CliUsageError);
  });
});
