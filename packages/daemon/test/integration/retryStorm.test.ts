/**
 * 规格第 5 节第 5 条：pi 的 retry-storm 剧本——通道持续报错，pi 自己不会放弃，服务在连续
 * 失败 8 次后判定 model_error 并结束进程（不是进程自己退出）。用轨迹文件核对「没有 end
 * 行」、用 Win32_Process 核对「进程确实已经不在了」。
 */
import { scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getWorker, submitWorker } from "./support/api.js";
import { type Harness, startHarness } from "./support/harness.js";
import { waitFor } from "./support/poll.js";
import { requireDefined } from "./support/require.js";
import { safeReadTrace, waitForTraceStarts } from "./support/trace.js";
import { waitForPidGone } from "./support/winProcess.js";

describe("重试风暴：连续失败 8 次后判定 model_error 并被服务结束（规格第 5 条）", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness({ capacity: 3 });
  }, 20000);

  // 全仓并行跑测试时 harness.stop() 要多花时间做假苦工进程的收尾，比 vitest 默认的
  // 10 秒钩子超时更容易超支，显式调宽。
  afterEach(async () => {
    await harness.stop();
  }, 30000);

  it("pi 的 retry-storm 剧本：最终失败、原因 model_error，进程被服务结束", async () => {
    const worker = await submitWorker(harness, {
      projectPath: harness.projectDir,
      prompt: scenarioPrompt("retry-storm", { delayMs: 20 }),
      runtime: "pi",
    });
    const workerId: string = worker.id;

    const startedTrace = await waitForTraceStarts(harness.traceFile, 1);
    const started = requireDefined(
      startedTrace.find((entry) => entry.event === "start"),
      "应该已经写出这个苦工的 start 轨迹",
    );
    const pid = started.pid;
    // 进程号会被系统复用，认「这是不是同一个苦工的 end」不能只看 pid，要看轨迹编号。
    const traceId = requireDefined(started.traceId, "start 轨迹应该带轨迹编号");

    // 8 次连续失败判定放弃之后，引擎还要等 10 秒确认进程没有自己退出才会强杀；
    // 给足够宽的超时（远超那 10 秒），不用固定 sleep 赌时序。
    await waitFor(
      async () => {
        const detail = await getWorker(harness, workerId);
        return detail.summary.status === "failed";
      },
      20000,
      200,
    );

    const detail = await getWorker(harness, workerId);
    expect(detail.summary.status).toBe("failed");
    expect(detail.summary.failReason).toBe("model_error");
    expect(detail.summary.errorMessage).toBe("通道连续 8 次请求失败：Connection error.");

    const finalTrace = safeReadTrace(harness.traceFile);
    const hasEnd = finalTrace.some((entry) => entry.event === "end" && entry.traceId === traceId);
    expect(hasEnd).toBe(false);

    // 进程被 taskkill /F 结束后，Windows 不保证立刻从进程列表里摘掉这条记录，
    // 开发机负载高时这个窗口会更长；统一用轮询直到消失，不做「等完再查一次」的两段式
    // （两次独立查询之间可能恰好夹着这条记录忽隐忽现的瞬间，和进程有没有真正结束无关）。
    // 传入 started.at：进程号如果在等待期间被系统复用给别的更晚创建的进程，
    // 那个新进程不该被当成我们还在等的这一个。
    await waitForPidGone(pid, 5000, 200, started.at);
  }, 35000);
});
