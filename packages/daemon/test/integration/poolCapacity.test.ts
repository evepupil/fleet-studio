/**
 * 规格第 5 节第 1 条：容量 3 的池同时派 9 个 success 苦工，任何时刻同时在跑的不超过 3 个，
 * 全部苦工最终都完成，且 9 个都真的启动过（不是有的从头到尾都没被放行）。
 *
 * 这条断言全仓并行跑（`pnpm exec vitest run packages apps`，同时有大量拉真实进程的测试）
 * 时出现过一次间歇性失败，没留下细节，需要能在下次复现时说清楚到底是「真的超了容量」
 * 还是别的什么没对上。为此这里留了两条独立证据链：
 *   1. 轨迹文件（假苦工自己写的 start/end，见 maxConcurrency）；
 *   2. 完全独立于轨迹的服务侧测量——测试期间每 100ms 问一次 /api/pools，直接记录服务
 *      自己汇报的 running 数峰值。两条证据互相印证，哪一条超了 3 都能定位到问题在哪一层。
 * 所有关键断言都带上完整诊断信息（每个苦工的终态、两条证据链的完整数据），失败时不用
 * 再回来重新摆一遍现场。
 */
import type { WorkerSummary } from "@fleet/core";
import { maxConcurrency, scenarioPrompt, type TraceEntry } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPools, submitWorker, waitForWorkers } from "./support/api.js";
import { TEST_POOL_ID } from "./support/config.js";
import { type Harness, startHarness } from "./support/harness.js";
import { sleep } from "./support/poll.js";
import { safeReadTrace } from "./support/trace.js";

function formatTrace(trace: readonly TraceEntry[]): string {
  if (trace.length === 0) {
    return "  （空）";
  }
  return trace
    .map(
      (entry) =>
        `  ${entry.event} pid=${entry.pid} at=${entry.at}${
          entry.args !== null ? ` args=${JSON.stringify(entry.args)}` : ""
        }`,
    )
    .join("\n");
}

function formatWorkerOutcomes(ids: readonly string[], done: readonly WorkerSummary[]): string {
  return ids
    .map((id) => {
      const summary = done.find((item) => item.id === id);
      if (summary === undefined) {
        return `  ${id}: 不在 done 列表里（这一轮等待结束时它还没到终态）`;
      }
      return `  ${id}: status=${summary.status} failReason=${summary.failReason} errorMessage=${summary.errorMessage}`;
    })
    .join("\n");
}

describe("容量闸门：容量 3 的池同时派 9 个（规格第 1 条）", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness({ capacity: 3 });
  }, 20000);

  // 全仓并行跑测试时 harness.stop() 要多花时间做假苦工进程的收尾（见 processCleanup.ts：
  // 先核对身份再结束、结束后再确认真的消失），比 vitest 默认的 10 秒钩子超时更容易超支，
  // 显式调宽。
  afterEach(async () => {
    await harness.stop();
  }, 30000);

  it("全部 9 个 success 苦工最终完成，同时在跑数从未超过 3，且 9 个都启动过", async () => {
    // 第二条与轨迹文件完全独立的证据链：从提交第一个苦工开始，到全部等待结束为止，
    // 每 100ms 直接问一次服务本身汇报的 running 数（走真实 HTTP /api/pools 接口，
    // 不经过测试自己对轨迹的推算）。
    const poolRunningSamples: number[] = [];
    let keepPolling = true;
    const poolPoller = (async () => {
      while (keepPolling) {
        try {
          const pools = await getPools(harness);
          const pool = pools.find((candidate: { id: string }) => candidate.id === TEST_POOL_ID);
          if (pool !== undefined) {
            poolRunningSamples.push(pool.running);
          }
        } catch {
          // 采样本身偶发的网络错误不该弄崩测试，跳过这一次继续采，不影响峰值统计。
        }
        await sleep(100);
      }
    })();

    const ids: string[] = [];
    try {
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

      keepPolling = false;
      await poolPoller;

      const trace = safeReadTrace(harness.traceFile);
      const maxConcurrencyFromTrace = maxConcurrency(trace);
      const maxRunningFromPoolApi =
        poolRunningSamples.length > 0 ? Math.max(...poolRunningSamples) : -1;

      const diagnostics = [
        `等待结果：timedOut=${result.timedOut} pending=${JSON.stringify(result.pending)}`,
        "每个苦工的最终状态：",
        formatWorkerOutcomes(ids, result.done),
        `轨迹算出的最大同时在跑数：${maxConcurrencyFromTrace}`,
        `/api/pools 轮询到的 running 峰值：${maxRunningFromPoolApi}`,
        `/api/pools 轮询采样序列（每 100ms 一次，共 ${poolRunningSamples.length} 个样本）：${JSON.stringify(poolRunningSamples)}`,
        "轨迹文件完整内容：",
        formatTrace(trace),
      ].join("\n");

      expect(result.timedOut, diagnostics).toBe(false);
      expect(result.pending, diagnostics).toEqual([]);
      expect(result.done, diagnostics).toHaveLength(9);
      for (const summary of result.done) {
        expect(
          summary.status,
          `苦工 ${summary.id} 的最终状态不是 completed。\n${diagnostics}`,
        ).toBe("completed");
      }

      const startCount = trace.filter((entry) => entry.event === "start").length;
      expect(startCount, diagnostics).toBe(9);
      expect(maxConcurrencyFromTrace, diagnostics).toBeLessThanOrEqual(3);
      expect(maxRunningFromPoolApi, diagnostics).toBeLessThanOrEqual(3);
    } finally {
      keepPolling = false;
    }
  }, 55000);
});
