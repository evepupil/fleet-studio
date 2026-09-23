/**
 * 规格第 5 节第 9 条：重启接管。两种情形都要判为已完成——
 * (a) 服务停掉时苦工进程还在跑，重新起服务后应该接着跟踪直到它自己跑完；
 * (b) 服务停掉期间苦工已经自己跑完，重新起服务后应该按输出直接判定结局。
 */
import { scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getWorker, submitWorker } from "./support/api.js";
import { type Harness, startHarness } from "./support/harness.js";
import { waitFor } from "./support/poll.js";
import { requireDefined } from "./support/require.js";
import { safeReadTrace, waitForTraceStarts } from "./support/trace.js";

// tools=4、delay=250ms 的 success 剧本总耗时约 4 秒，留足窗口在「跑到一半」时停服务、
// 也留足窗口等它在服务下线期间自然跑完，两种情形都不用赌精确的毫秒数。
const LONG_SUCCESS_PROMPT = scenarioPrompt("success", { delayMs: 250, tools: 4 });

describe("重启接管：两种情形都判为已完成（规格第 9 条）", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness({ capacity: 3 });
  }, 20000);

  // 全仓并行跑测试时 harness.stop() 要多花时间做假苦工进程的收尾，比 vitest 默认的
  // 10 秒钩子超时更容易超支，显式调宽。
  afterEach(async () => {
    await harness.stop();
  }, 30000);

  it("服务停掉时苦工进程继续运行，重启后接着跟踪直到完成", async () => {
    const worker = await submitWorker(harness, {
      projectPath: harness.projectDir,
      prompt: LONG_SUCCESS_PROMPT,
    });
    const workerId: string = worker.id;

    await waitFor(
      async () => (await getWorker(harness, workerId)).summary.status === "running",
      5000,
      50,
    );
    const midFlight = await getWorker(harness, workerId);
    expect(midFlight.summary.status).toBe("running");

    // 「running」是放行循环占位时立刻写的（模块设计 3.4：先占槛位再交给启动器），
    // 真正的进程要晚一步才拉起来；必须等轨迹文件确认进程已经真的起来了才能停服务，
    // 否则停服务的一刻进程还没启动，重启后的接管会因为拿不到 pid 而误判成 interrupted。
    await waitForTraceStarts(harness.traceFile, 1);

    await harness.restart();

    await waitFor(
      async () => (await getWorker(harness, workerId)).summary.status === "completed",
      15000,
      200,
    );
    const final = await getWorker(harness, workerId);
    expect(final.summary.status).toBe("completed");
  }, 35000);

  it("停服务后等苦工自己跑完，再启动服务，结局同样判为已完成", async () => {
    const worker = await submitWorker(harness, {
      projectPath: harness.projectDir,
      prompt: LONG_SUCCESS_PROMPT,
    });
    const workerId: string = worker.id;

    await waitFor(
      async () => (await getWorker(harness, workerId)).summary.status === "running",
      5000,
      50,
    );

    const trace = await waitForTraceStarts(harness.traceFile, 1);
    const started = requireDefined(
      trace.find((entry) => entry.event === "start"),
      "应该已经写出这个苦工的 start 轨迹",
    );
    // 进程号会被系统复用，认「这是不是同一个苦工的 end」不能只看 pid，要看轨迹编号。
    const traceId = requireDefined(started.traceId, "start 轨迹应该带轨迹编号");

    await harness.stopDaemonOnly();

    // 服务下线期间没有人跟踪这个进程，只能靠轨迹文件确认它已经自己写完 end 行
    // （假苦工进程不受服务生死影响，会照常跑完剧本、正常退出）。
    await waitFor(
      () => {
        const entries = safeReadTrace(harness.traceFile);
        return entries.some((entry) => entry.event === "end" && entry.traceId === traceId);
      },
      8000,
      100,
    );

    await harness.startDaemonAgain();

    await waitFor(
      async () => (await getWorker(harness, workerId)).summary.status === "completed",
      5000,
      100,
    );
    const final = await getWorker(harness, workerId);
    expect(final.summary.status).toBe("completed");
  }, 35000);
});
