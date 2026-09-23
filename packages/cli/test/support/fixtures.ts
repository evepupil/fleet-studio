import { type RunView, type WorkerDetail, type WorkerSummary, ZERO_USAGE } from "@fleet/core";

/** 造一个 WorkerSummary 夹具，测试只需要覆盖自己关心的字段。 */
export function fakeWorker(overrides: Partial<WorkerSummary> = {}): WorkerSummary {
  return {
    id: "w7k2mq",
    projectKey: "c:\\code\\demo",
    cwd: "C:\\code\\demo",
    title: "类目配置校验",
    role: "worker",
    roleLabel: "实现",
    runtime: "pi",
    poolId: "dsf",
    model: "mcgrox/deepseek-v4.1-flash",
    status: "queued",
    failReason: null,
    errorMessage: null,
    runSeq: 1,
    createdAt: "2026-09-23T09:59:59.000Z",
    queuedAt: "2026-09-23T09:59:59.000Z",
    startedAt: null,
    endedAt: null,
    lastActivityAt: null,
    activity: null,
    retry: null,
    verdict: null,
    usage: ZERO_USAGE,
    queuePosition: 1,
    ...overrides,
  };
}

/** 造一个 RunView 夹具。 */
export function fakeRun(overrides: Partial<RunView> = {}): RunView {
  return {
    id: "w7k2mq.1",
    seq: 1,
    status: "completed",
    failReason: null,
    errorMessage: null,
    prompt: "写代码",
    queuedAt: "2026-09-23T09:59:59.000Z",
    startedAt: "2026-09-23T10:00:00.000Z",
    endedAt: "2026-09-23T10:00:05.000Z",
    exitCode: 0,
    usage: ZERO_USAGE,
    finalText: "SUMMARY: 完成了\nSELF_REPORT: pass",
    report: { sections: [{ key: "SUMMARY", text: "完成了" }], verdict: "pass" },
    ...overrides,
  };
}

/** 造一个 WorkerDetail 夹具：summary 和 runs 分开传，避免两处字段互相打架。 */
export function fakeDetail(
  summary: WorkerSummary,
  runs: readonly RunView[] = [fakeRun()],
  overrides: Partial<Pick<WorkerDetail, "projectPath" | "sessionRef" | "thinking">> = {},
): WorkerDetail {
  return {
    summary,
    projectPath: "C:\\proj",
    sessionRef: null,
    thinking: null,
    runs: [...runs],
    ...overrides,
  };
}
