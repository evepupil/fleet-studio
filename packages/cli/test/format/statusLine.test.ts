import { type WorkerSummary, ZERO_USAGE } from "@fleet/core";
import { describe, expect, it } from "vitest";
import {
  describeFailureReason,
  describeStatus,
  formatStatusLine,
} from "../../src/format/statusLine.js";

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

describe("describeFailureReason", () => {
  it("有失败原因和说明时拼成「原因：说明」", () => {
    expect(
      describeFailureReason({ failReason: "timeout", errorMessage: "运行超过 5 分钟被结束" }),
    ).toBe("运行超时：运行超过 5 分钟被结束");
  });

  it("有失败原因但没有说明时只写原因", () => {
    expect(describeFailureReason({ failReason: "timeout", errorMessage: null })).toBe("运行超时");
  });

  it("没有失败原因但有说明时只写说明（典型的已取消）", () => {
    expect(describeFailureReason({ failReason: null, errorMessage: "用户取消" })).toBe("用户取消");
  });

  it("两边都没有时给占位说明，不留空", () => {
    expect(describeFailureReason({ failReason: null, errorMessage: null })).toBe("没有更多说明");
  });
});

describe("formatStatusLine", () => {
  it("按规格拼出 编号  状态  池/角色  时长  标题", () => {
    const worker = baseWorker({ status: "running" });
    const now = new Date("2026-09-23T10:00:00.000Z");
    expect(formatStatusLine(worker, now)).toBe("w7k2mq  工作中  dsf/实现  3分12秒  类目配置校验");
  });
});
