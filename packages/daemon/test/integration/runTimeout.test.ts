/**
 * 规格第 5 节第 6 条：运行超时。剧本 spawn-child-hang——服务应该判定失败、原因 timeout，
 * 并且把父进程和它拉起的子进程都结束掉（用 Win32_Process 核对，不是只看服务自己汇报的
 * 状态）。timeoutMin 用 0.2（12 秒，规格给的例子是 0.05／3 秒）：核对父子进程存活要连续
 * 几次 PowerShell Get-CimInstance 调用，每次都要新起一个 powershell.exe，开发机上跑别的
 * 任务、CPU 紧张时这几次调用可能各花上一两秒，给够余量避免和超时本身赛跑；测试本身的
 * 超时也显式调宽（项目全局 testTimeout 是 20 秒，这条用例的等待预算比这个还宽）。
 */
import { scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getWorker, submitWorker } from "./support/api.js";
import { type Harness, startHarness } from "./support/harness.js";
import { waitFor } from "./support/poll.js";
import { requireDefined } from "./support/require.js";
import { waitForTraceStarts } from "./support/trace.js";
import { findChildPids, isPidAlive } from "./support/winProcess.js";

const TEST_TIMEOUT_MS = 45000;

describe("运行超时：failReason timeout，父子进程都被结束（规格第 6 条）", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness({ capacity: 3 });
  });

  afterEach(async () => {
    await harness.stop();
  });

  it(
    "timeoutMin 配合 spawn-child-hang：失败、原因 timeout，父进程和子进程都已结束",
    async () => {
      const worker = await submitWorker(harness, {
        projectPath: harness.projectDir,
        prompt: scenarioPrompt("spawn-child-hang"),
        runtime: "pi",
        timeoutMin: 0.2,
      });
      const workerId: string = worker.id;

      const trace = await waitForTraceStarts(harness.traceFile, 1);
      const started = requireDefined(
        trace.find((entry) => entry.event === "start"),
        "应该已经写出这个苦工的 start 轨迹",
      );
      const parentPid = started.pid;
      expect(await isPidAlive(parentPid)).toBe(true);

      let childPid = 0;
      await waitFor(async () => {
        const children = await findChildPids(parentPid);
        const first = children[0];
        if (first === undefined) {
          return false;
        }
        childPid = first;
        return true;
      }, 5000);
      expect(await isPidAlive(childPid)).toBe(true);

      // timeoutMs = 12000；超时检查每秒一轮，给足够宽的超时不用固定 sleep 赌时序。
      await waitFor(
        async () => {
          const detail = await getWorker(harness, workerId);
          return detail.summary.status === "failed";
        },
        30000,
        200,
      );

      const detail = await getWorker(harness, workerId);
      expect(detail.summary.status).toBe("failed");
      expect(detail.summary.failReason).toBe("timeout");
      expect(detail.summary.errorMessage).toBe("运行超过 1 分钟被结束");

      await waitFor(
        async () => !(await isPidAlive(parentPid)) && !(await isPidAlive(childPid)),
        5000,
        200,
      );
      expect(await isPidAlive(parentPid)).toBe(false);
      expect(await isPidAlive(childPid)).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );
});
