/**
 * 规格第 5 节第 8 条：续接。对已完成的苦工追加指令会产生第 2 次运行并复用同一个会话——
 * pi 两次运行的 --session-id 参数相同；opencode 第 2 次运行带上首次运行事件流里拿到的
 * 会话编号。续接中的苦工（第 2 次运行还没结束）再次续接要返回 409。
 */
import { scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getWorker, sendMessage } from "./support/api.js";
import { type Harness, startHarness } from "./support/harness.js";
import { waitFor } from "./support/poll.js";
import { requireDefined } from "./support/require.js";
import { submitAndWait } from "./support/runOnce.js";
import { findArgValue, startEntries, waitForTraceStarts } from "./support/trace.js";

describe("续接：复用会话，续接中再续接返回 409（规格第 8 条）", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness({ capacity: 3 });
  }, 20000);

  // 全仓并行跑测试时 harness.stop() 要多花时间做假苦工进程的收尾，比 vitest 默认的
  // 10 秒钩子超时更容易超支，显式调宽。
  afterEach(async () => {
    await harness.stop();
  }, 30000);

  it("pi 续接：第 2 次运行的 --session-id 和第 1 次相同", async () => {
    const { workerId } = await submitAndWait(
      harness,
      {
        projectPath: harness.projectDir,
        prompt: scenarioPrompt("success", { delayMs: 30, tools: 1 }),
        runtime: "pi",
      },
      15,
    );

    const firstDetail = await getWorker(harness, workerId);
    const sessionRef: string = firstDetail.sessionRef;
    expect(sessionRef).toBe(`fleet-${workerId}`);

    const sendResult = await sendMessage(
      harness,
      workerId,
      scenarioPrompt("success", { delayMs: 30, tools: 1 }),
    );
    expect(sendResult.status).toBe(200);

    await waitFor(
      async () => {
        const detail = await getWorker(harness, workerId);
        return detail.summary.status === "completed" && detail.summary.runSeq === 2;
      },
      10000,
      100,
    );

    const trace = await waitForTraceStarts(harness.traceFile, 2);
    const starts = startEntries(trace);
    expect(starts).toHaveLength(2);
    const run1Args = requireDefined(starts[0], "应该有第 1 次运行的 start 轨迹").args;
    const run2Args = requireDefined(starts[1], "应该有第 2 次运行的 start 轨迹").args;
    expect(findArgValue(run1Args, "--session-id")).toBe(sessionRef);
    expect(findArgValue(run2Args, "--session-id")).toBe(sessionRef);
  }, 30000);

  it("opencode 续接：第 2 次运行带上首次运行事件流里的会话编号", async () => {
    // 延时压到最短：整次运行要在引擎共享的 400ms 跟踪定时器一个节拍内跑完，
    // 才能验证「即使这次运行从没被轮询命中过，会话编号也已经落库」（模块设计 3.6 第 4
    // 步：opencode 拿到会话编号要立刻写苦工，这样这次运行失败也能续接）。
    const { workerId } = await submitAndWait(
      harness,
      {
        projectPath: harness.projectDir,
        prompt: scenarioPrompt("success", { delayMs: 1, tools: 1 }),
        runtime: "opencode",
      },
      15,
    );

    const firstDetail = await getWorker(harness, workerId);
    const sessionRef = firstDetail.sessionRef;
    expect(sessionRef).not.toBeNull();
    expect(String(sessionRef).startsWith("ses_fake")).toBe(true);

    const sendResult = await sendMessage(
      harness,
      workerId,
      scenarioPrompt("success", { delayMs: 30, tools: 1 }),
    );
    expect(sendResult.status).toBe(200);

    await waitFor(
      async () => {
        const detail = await getWorker(harness, workerId);
        return detail.summary.status === "completed" && detail.summary.runSeq === 2;
      },
      10000,
      100,
    );

    const trace = await waitForTraceStarts(harness.traceFile, 2);
    const starts = startEntries(trace);
    expect(starts).toHaveLength(2);
    const run1Args = requireDefined(starts[0], "应该有第 1 次运行的 start 轨迹").args;
    const run2Args = requireDefined(starts[1], "应该有第 2 次运行的 start 轨迹").args;
    expect(findArgValue(run1Args, "--session")).toBeUndefined();
    expect(findArgValue(run2Args, "--session")).toBe(sessionRef);
  }, 30000);

  it("续接中的苦工再次续接返回 409", async () => {
    const { workerId } = await submitAndWait(
      harness,
      {
        projectPath: harness.projectDir,
        prompt: scenarioPrompt("success", { delayMs: 30, tools: 1 }),
      },
      15,
    );

    const firstContinuation = await sendMessage(harness, workerId, scenarioPrompt("hang"));
    expect(firstContinuation.status).toBe(200);
    await waitFor(
      async () => {
        const detail = await getWorker(harness, workerId);
        return detail.summary.status === "running";
      },
      5000,
      100,
    );

    const secondContinuation = await sendMessage(harness, workerId, "再来一次");
    expect(secondContinuation.status).toBe(409);
    expect(secondContinuation.body.error.code).toBe("conflict");
    expect(secondContinuation.body.error.message).toBe(
      "苦工还在排队或工作中，等它结束后再追加指令",
    );

    // 「running」是放行循环占位时立刻写的，真正的进程要晚一步才拉起来（模块设计 3.4）。
    // 测试到这里就结束的话，afterEach 读轨迹文件找残留进程时，这个续接进程可能还没来得
    // 及写 start 行，会被漏杀；等它真正起来再让测试收尾。
    await waitForTraceStarts(harness.traceFile, 2);
  }, 30000);
});
