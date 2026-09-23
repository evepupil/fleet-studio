/**
 * 规格第 5 节第 6 条：运行超时。剧本 spawn-child-hang——服务应该判定失败、原因 timeout，
 * 并且把父进程和它拉起的子进程都结束掉（用 Win32_Process 核对，不是只看服务自己汇报的
 * 状态）。
 *
 * timeoutMin 用 0.5（30 秒，规格给的例子是 0.05／3 秒）：引擎判定超时的时钟从苦工
 * 「开跑」那一刻就开始走，和测试这边发现子进程、读取轨迹等操作共用同一段真实时间；
 * 全仓并行跑测试时，光是找到子进程这一步（内部要轮询 Win32_Process）实测就可能花掉
 * 十几秒，给的窗口太窄会导致引擎在测试还没来得及往下走时就已经把进程结束了。
 * 不在超时触发前对父、子进程再单独断言一次「还活着」——找到它们本身（trace 里的
 * start 行、findChildPids 的返回值非空）已经证明了它们存在过，多一次独立的
 * isPidAlive 查询只是徒增一次和超时赛跑的机会，不增加确定性。
 */
import { scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getWorker, submitWorker } from "./support/api.js";
import { type Harness, startHarness } from "./support/harness.js";
import { waitFor } from "./support/poll.js";
import { requireDefined } from "./support/require.js";
import { waitForTraceStarts } from "./support/trace.js";
import { findChildPids, waitForPidGone } from "./support/winProcess.js";

const TEST_TIMEOUT_MS = 60000;

describe("运行超时：failReason timeout，父子进程都被结束（规格第 6 条）", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness({ capacity: 3 });
  }, 20000);

  // 全仓并行跑测试时 harness.stop() 要多花时间做假苦工进程的收尾，比 vitest 默认的
  // 10 秒钩子超时更容易超支，显式调宽。
  afterEach(async () => {
    await harness.stop();
  }, 30000);

  it(
    "timeoutMin 配合 spawn-child-hang：失败、原因 timeout，父进程和子进程都已结束",
    async () => {
      const worker = await submitWorker(harness, {
        projectPath: harness.projectDir,
        prompt: scenarioPrompt("spawn-child-hang"),
        runtime: "pi",
        timeoutMin: 0.5,
      });
      const workerId: string = worker.id;

      const trace = await waitForTraceStarts(harness.traceFile, 1);
      const started = requireDefined(
        trace.find((entry) => entry.event === "start"),
        "应该已经写出这个苦工的 start 轨迹",
      );
      const parentPid = started.pid;

      let childPid = 0;
      // 子进程没有自己的轨迹行（它不是假苦工脚本，是假苦工拉起来的裸 node 进程），拿不到
      // 它真正的创建时间；用调用 findChildPids 观察到它存在的这一刻当上界——子进程的创建
      // 必然不晚于这个观察时刻。
      let childObservedAtMs = 0;
      await waitFor(async () => {
        const children = await findChildPids(parentPid);
        const first = children[0];
        if (first === undefined) {
          return false;
        }
        childPid = first;
        childObservedAtMs = Date.now();
        return true;
      }, 8000);

      // timeoutMs = 30000；超时检查每秒一轮，给足够宽的超时不用固定 sleep 赌时序。
      await waitFor(
        async () => {
          const detail = await getWorker(harness, workerId);
          return detail.summary.status === "failed";
        },
        45000,
        200,
      );

      const detail = await getWorker(harness, workerId);
      expect(detail.summary.status).toBe("failed");
      expect(detail.summary.failReason).toBe("timeout");
      expect(detail.summary.errorMessage).toBe("运行超过 1 分钟被结束");

      // 轮询直到父子进程都彻底从进程列表里消失，不做「等完再查一次」的两段式
      // （taskkill /F 之后 Windows 不保证立刻摘掉记录，开发机负载高时这个窗口更长；
      // 两次独立查询之间可能夹着记录忽隐忽现的瞬间，和进程有没有真正结束无关）。传入
      // 创建时间上界：进程号如果在等待期间被系统复用给别的更晚创建的进程，那个新进程
      // 不该被当成我们还在等的这一个。
      await waitForPidGone(parentPid, 5000, 200, started.at);
      await waitForPidGone(childPid, 5000, 200, childObservedAtMs);
    },
    TEST_TIMEOUT_MS,
  );
});
