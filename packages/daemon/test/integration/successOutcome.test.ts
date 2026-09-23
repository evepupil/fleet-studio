/**
 * 规格第 5 节第 3 条：成功剧本——状态已完成、最新运行的回报结论为通过、用量大于 0、
 * 时间线里有工具调用和工具结果事件。pi、opencode 各测一遍。
 */
import type { TimelineEvent } from "@fleet/core";
import { scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getTimeline, getWorker } from "./support/api.js";
import { type Harness, startHarness } from "./support/harness.js";
import { submitAndWait } from "./support/runOnce.js";

describe("成功剧本：状态、回报、用量、时间线（规格第 3 条）", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness({ capacity: 3 });
  });

  afterEach(async () => {
    await harness.stop();
  });

  async function assertSuccessOutcome(runtime: "pi" | "opencode"): Promise<void> {
    const { workerId, summary } = await submitAndWait(
      harness,
      {
        projectPath: harness.projectDir,
        prompt: scenarioPrompt("success", { delayMs: 50, tools: 2 }),
        runtime,
      },
      15,
    );

    expect(summary.status).toBe("completed");
    expect(summary.usage.totalTokens).toBeGreaterThan(0);

    const detail = await getWorker(harness, workerId);
    const runs = detail.runs;
    const latestRun = runs[runs.length - 1];
    expect(latestRun.report).not.toBeNull();
    expect(latestRun.report.verdict).toBe("pass");

    const timeline = await getTimeline(harness, workerId);
    const kinds = timeline.events.map((event: TimelineEvent) => event.kind);
    expect(kinds).toContain("tool_call");
    expect(kinds).toContain("tool_result");
  }

  it("pi 的 success 剧本：已完成、回报通过、用量大于 0、时间线含工具调用与结果", async () => {
    await assertSuccessOutcome("pi");
  }, 25000);

  it("opencode 的 success 剧本：已完成、回报通过、用量大于 0、时间线含工具调用与结果", async () => {
    await assertSuccessOutcome("opencode");
  }, 25000);
});
