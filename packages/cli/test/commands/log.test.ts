import type { TimelineEvent } from "@fleet/core";
import { afterEach, describe, expect, it } from "vitest";
import { runLogCommand } from "../../src/commands/log.js";
import { CliUsageError, EXIT_CODE } from "../../src/errors.js";
import { type CommandHarness, createCommandHarness } from "../support/commandHarness.js";
import { findRequest } from "../support/stubServer.js";

const AT = new Date(2026, 8, 23, 9, 5, 3).toISOString();

function textEvent(seq: number, runSeq = 1): TimelineEvent {
  return { kind: "text", seq, runSeq, at: AT, text: `第 ${seq} 条` };
}

let harness: CommandHarness | undefined;

afterEach(async () => {
  await harness?.cleanup();
  harness = undefined;
});

describe("runLogCommand", () => {
  it("单页时间线：逐条一行，前面带分隔线", async () => {
    const workerId = "w7k2mq";
    const events = [textEvent(0), textEvent(1)];
    harness = await createCommandHarness((request) => {
      if (request.path === `/api/workers/${workerId}/timeline`) {
        return { status: 200, body: { events, next: 1, total: 2 } };
      }
      throw new Error(`意外请求：${request.method} ${request.path}`);
    });

    const exitCode = await runLogCommand([workerId], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(harness.deps.stdoutLines[0]).toBe("── 第 1 次运行 ──");
    expect(harness.deps.stdoutLines[1]).toContain("第 0 条");
    expect(harness.deps.stdoutLines[2]).toContain("第 1 条");

    const request = findRequest(harness.stub.requests, "GET", `/api/workers/${workerId}/timeline`);
    expect(request.query.get("after")).toBe("-1");
    expect(request.query.get("limit")).toBe("2000");
  });

  it("满页时会翻下一页，直到拿完整个时间线", async () => {
    const workerId = "w7k2mq";
    const fullPage = Array.from({ length: 2000 }, (_, index) => textEvent(index));
    const lastEvent = textEvent(2000);
    let callCount = 0;

    harness = await createCommandHarness((request) => {
      if (request.path === `/api/workers/${workerId}/timeline`) {
        callCount += 1;
        if (callCount === 1) {
          expect(request.query.get("after")).toBe("-1");
          return { status: 200, body: { events: fullPage, next: 1999, total: 2001 } };
        }
        expect(request.query.get("after")).toBe("1999");
        return { status: 200, body: { events: [lastEvent], next: 2000, total: 2001 } };
      }
      throw new Error(`意外请求：${request.method} ${request.path}`);
    });

    const exitCode = await runLogCommand([workerId, "--json"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(callCount).toBe(2);
    const parsed = JSON.parse(harness.deps.stdoutLines.join("\n"));
    expect(parsed.length).toBe(2001);
  });

  it("--tail 只保留最后几条", async () => {
    const workerId = "w7k2mq";
    const events = [textEvent(0), textEvent(1), textEvent(2)];
    harness = await createCommandHarness(() => ({
      status: 200,
      body: { events, next: 2, total: 3 },
    }));

    const exitCode = await runLogCommand([workerId, "--tail", "1", "--json"], harness.deps);
    expect(exitCode).toBe(EXIT_CODE.ok);
    const parsed = JSON.parse(harness.deps.stdoutLines.join("\n"));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].seq).toBe(2);
  });

  it("没有给编号时报用法错误", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: {} }));
    await expect(runLogCommand([], harness.deps)).rejects.toThrow(CliUsageError);
  });
});
