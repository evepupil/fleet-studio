/**
 * 规格第 5 节第 1 条：容量 3 的池同时派 9 个 success 苦工，任何时刻同时在跑的不超过 3 个，
 * 全部苦工最终都完成，且 9 个都真的启动过（不是有的从头到尾都没被放行）。
 */
import { maxConcurrency, scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { submitWorker, waitForWorkers } from "./support/api.js";
import { type Harness, startHarness } from "./support/harness.js";
import { safeReadTrace } from "./support/trace.js";

describe("容量闸门：容量 3 的池同时派 9 个（规格第 1 条）", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness({ capacity: 3 });
  });

  afterEach(async () => {
    await harness.stop();
  });

  it("全部 9 个 success 苦工最终完成，同时在跑数从未超过 3，且 9 个都启动过", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 9; i += 1) {
      const worker = await submitWorker(harness, {
        projectPath: harness.projectDir,
        prompt: scenarioPrompt("success", { delayMs: 300 }),
      });
      ids.push(worker.id);
    }

    // /api/wait 单次最多挂 45 秒；测试自身的超时要留够余量，不能卡在项目全局
    // 20 秒的默认值上（开发机繁忙时 9 个苦工分 3 批跑完可能明显超过正常耗时）。
    const result = await waitForWorkers(harness, ids, "all", 45);
    expect(result.timedOut).toBe(false);
    expect(result.pending).toEqual([]);
    expect(result.done).toHaveLength(9);
    for (const summary of result.done) {
      expect(summary.status).toBe("completed");
    }

    const trace = safeReadTrace(harness.traceFile);
    const startCount = trace.filter((entry) => entry.event === "start").length;
    expect(startCount).toBe(9);
    expect(maxConcurrency(trace)).toBeLessThanOrEqual(3);
  }, 55000);
});
