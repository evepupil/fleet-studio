/**
 * 很多用例的形状都是「派一个苦工，等它到终态，看结果」；抽成一个小工具，测试文件里
 * 只留场景相关的参数和断言。等待用 /api/wait（而不是固定时长的 sleep），按需可以调大
 * timeoutSec（单次最多 60，见 WAIT_MAX_SECONDS）。
 *
 * 故意不给返回值声明具体接口：summary 就是 WaitResult.done[0] 那份 WorkerSummary，
 * 调用方要挨个取 status / failReason / errorMessage 这些字段，声明成 unknown 反而逼着
 * 每处都要收窄一次；让它跟 readJsonBody 一样保持隐式 any（详见 http.ts 的说明），
 * 断言错了照样会在运行时被 vitest 的 expect 抓到。
 */
import { type SubmitOptions, submitWorker, waitForWorkers } from "./api.js";
import type { Harness } from "./harness.js";
import { requireDefined } from "./require.js";

export async function submitAndWait(harness: Harness, options: SubmitOptions, timeoutSec = 30) {
  const worker = await submitWorker(harness, options);
  const workerId: string = worker.id;
  const result = await waitForWorkers(harness, [workerId], "all", timeoutSec);
  if (result.pending.length > 0) {
    throw new Error(`苦工 ${workerId} 在 ${timeoutSec}s 内没有结束`);
  }
  const summary = requireDefined(result.done[0], "等待结果里应该有这个苦工的摘要");
  return { workerId, summary };
}
