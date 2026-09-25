import { type WorkerSummary, ZERO_USAGE } from "@fleet/core";
import { describe, expect, it } from "vitest";
import {
  describeFailureReason,
  describePlacement,
  describePoolAndModel,
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
    requestedPool: "dsf",
    poolId: "dsf",
    model: "mcgrox/deepseek-v4.1-flash",
    channel: "mcgrox",
    modelName: "deepseek-v4.1-flash",
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
    runMs: 0,
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

  it("还没分到池（poolId 为 null）时池那一段写「公共排队」", () => {
    const worker = baseWorker({
      status: "queued",
      poolId: null,
      model: null,
      requestedPool: null,
      startedAt: null,
      queuedAt: "2026-09-23T09:56:48.000Z",
      queuePosition: 2,
    });
    const now = new Date("2026-09-23T10:00:00.000Z");
    expect(formatStatusLine(worker, now)).toBe(
      "w7k2mq  排队中（第2位）  公共排队/实现  3分12秒  类目配置校验",
    );
  });
});

describe("describePlacement（fleet run 的第三行）", () => {
  it("工作中：池编号加显示用的模型名", () => {
    const worker = baseWorker({ status: "running" });
    expect(describePlacement(worker)).toBe("池：dsf（mcgrox/deepseek-v4.1-flash）");
  });

  it("点名排队：池编号和第几位", () => {
    const worker = baseWorker({ status: "queued", queuePosition: 3 });
    expect(describePlacement(worker)).toBe("排队中：dsf 第 3 位");
  });

  it("公共排队：写等任一池空位和公共排队位置", () => {
    const worker = baseWorker({
      status: "queued",
      poolId: null,
      model: null,
      requestedPool: null,
      queuePosition: 2,
    });
    expect(describePlacement(worker)).toBe("排队中，等任一池空位（公共排队第 2 位）");
  });

  it("没有排队位置时公共排队那一行不留空括号", () => {
    const worker = baseWorker({
      status: "queued",
      poolId: null,
      model: null,
      requestedPool: null,
      queuePosition: null,
    });
    expect(describePlacement(worker)).toBe("排队中，等任一池空位（公共排队）");
  });

  it("结束态没有第三行可讲", () => {
    expect(describePlacement(baseWorker({ status: "completed" }))).toBeNull();
    expect(describePlacement(baseWorker({ status: "failed" }))).toBeNull();
    expect(describePlacement(baseWorker({ status: "cancelled" }))).toBeNull();
  });
});

describe("describePoolAndModel（fleet show 的池与模型一行）", () => {
  it("分到池了写池编号和模型", () => {
    expect(describePoolAndModel(baseWorker({}))).toBe("dsf · mcgrox/deepseek-v4.1-flash");
  });

  it("还没分到池时写公共排队占位", () => {
    expect(describePoolAndModel({ poolId: null, model: null })).toBe("公共排队（还没分到池）");
  });
});
