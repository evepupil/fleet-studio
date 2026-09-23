import { type WorkerSummary, ZERO_USAGE } from "@fleet/core";
import { describe, expect, it } from "vitest";
import { describeStatus, formatStatusLine } from "../../src/format/statusLine.js";

function baseWorker(overrides: Partial<WorkerSummary>): WorkerSummary {
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
    status: "running",
    failReason: null,
    errorMessage: null,
    runSeq: 1,
    createdAt: "2026-09-23T09:00:00.000Z",
    queuedAt: "2026-09-23T09:00:00.000Z",
    startedAt: "2026-09-23T09:56:48.000Z",
    endedAt: null,
    lastActivityAt: null,
    activity: null,
    retry: null,
    verdict: null,
    usage: ZERO_USAGE,
    queuePosition: null,
    ...overrides,
  };
}

describe("describeStatus", () => {
  it("排队中带第 N 位", () => {
    const worker = baseWorker({ status: "queued", queuePosition: 3 });
    expect(describeStatus(worker)).toBe("排队中（第3位）");
  });

  it("重试中带重试 N/M", () => {
    const worker = baseWorker({
      status: "running",
      retry: { attempt: 2, max: 5, message: "连接超时" },
    });
    expect(describeStatus(worker)).toBe("工作中（重试2/5）");
  });

  it("自评不通过时附加说明", () => {
    const worker = baseWorker({ status: "completed", verdict: "fail" });
    expect(describeStatus(worker)).toBe("已完成（自评不通过）");
  });

  it("正常完成不附加任何说明", () => {
    const worker = baseWorker({ status: "completed", verdict: "pass" });
    expect(describeStatus(worker)).toBe("已完成");
  });

  it("普通工作中不附加任何说明", () => {
    const worker = baseWorker({ status: "running" });
    expect(describeStatus(worker)).toBe("工作中");
  });
});

describe("formatStatusLine", () => {
  it("按规格拼出 编号  状态  池/角色  时长  标题", () => {
    const worker = baseWorker({ status: "running" });
    const now = new Date("2026-09-23T10:00:00.000Z");
    expect(formatStatusLine(worker, now)).toBe("w7k2mq  工作中  dsf/实现  3分12秒  类目配置校验");
  });
});
