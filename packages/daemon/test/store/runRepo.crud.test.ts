import type { DatabaseSync } from "node:sqlite";
import { ZERO_USAGE } from "@fleet/core";
import { describe, expect, it } from "vitest";
import {
  createProjectRepo,
  createRunRepo,
  createWorkerRepo,
  openDatabase,
} from "../../src/store/index.js";
import { createProjectRecord, createRunRecord, createWorkerRecord } from "./factories.js";

/** 每个用例独立开一个内存库，插好一个项目和一个苦工 w1 当外键落脚点。 */
function setup(): { db: DatabaseSync; runs: ReturnType<typeof createRunRepo> } {
  const db = openDatabase(":memory:");
  createProjectRepo(db).insert(createProjectRecord({ key: "p1" }));
  createWorkerRepo(db).insert(createWorkerRecord({ id: "w1", projectKey: "p1" }));
  return { db, runs: createRunRepo(db) };
}

describe("runRepo：get / insert / update", () => {
  it("get：不存在返回 null", () => {
    const { runs } = setup();
    expect(runs.get("w1.1")).toBeNull();
  });

  it("insert 后 get 拿到的字段和写入的一致，含用量和重试信息的 JSON 往返", () => {
    const { runs } = setup();
    const run = createRunRecord({
      id: "w1.1",
      workerId: "w1",
      seq: 1,
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 1,
        cacheWriteTokens: 2,
        totalTokens: 33,
        costUsd: 0.05,
      },
      retry: { attempt: 1, max: 3, message: "限流，重试中" },
    });
    runs.insert(run);
    expect(runs.get("w1.1")).toEqual(run);
  });

  it("insert：spawnedAt 非 null 时正确往返（拿到进程号的时刻）", () => {
    const { runs } = setup();
    const run = createRunRecord({
      id: "w1.1",
      workerId: "w1",
      pid: 4321,
      processImage: "node.exe",
      spawnedAt: "2026-01-01T00:00:30.000Z",
    });
    runs.insert(run);
    expect(runs.get("w1.1")).toEqual(run);
  });

  it("runMs 与结构化用量列往返一致", () => {
    const { runs } = setup();
    const run = createRunRecord({
      id: "w1.1",
      workerId: "w1",
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:01:00.000Z",
      runMs: 60_000,
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 3,
        cacheWriteTokens: 4,
        totalTokens: 37,
        costUsd: null,
      },
    });
    runs.insert(run);
    expect(runs.get(run.id)).toEqual(run);
  });

  it("insert：costUsd 为 null、retry 为 null 时也能正确往返", () => {
    const { runs } = setup();
    const run = createRunRecord({ id: "w1.1", workerId: "w1", usage: ZERO_USAGE, retry: null });
    runs.insert(run);
    expect(runs.get("w1.1")?.usage.costUsd).toBeNull();
    expect(runs.get("w1.1")?.retry).toBeNull();
  });

  describe("update", () => {
    it("patch 为空对象时什么都不改", () => {
      const { runs } = setup();
      const run = createRunRecord({ id: "w1.1", workerId: "w1" });
      runs.insert(run);
      runs.update("w1.1", {});
      expect(runs.get("w1.1")).toEqual(run);
    });

    it("开跑：只改 status / startedAt / pid / processImage，其余不变", () => {
      const { runs } = setup();
      runs.insert(createRunRecord({ id: "w1.1", workerId: "w1", status: "queued" }));
      runs.update("w1.1", {
        status: "running",
        startedAt: "2026-01-01T00:01:00.000Z",
        pid: 4321,
        processImage: "node.exe",
      });
      const updated = runs.get("w1.1");
      expect(updated?.status).toBe("running");
      expect(updated?.startedAt).toBe("2026-01-01T00:01:00.000Z");
      expect(updated?.pid).toBe(4321);
      expect(updated?.processImage).toBe("node.exe");
      expect(updated?.prompt).toBe("任务内容");
      expect(updated?.queuedAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("拿到进程号：pid / processImage / spawnedAt 一次写入，spawnedAt 往返一致", () => {
      const { runs } = setup();
      runs.insert(createRunRecord({ id: "w1.1", workerId: "w1", status: "running" }));
      runs.update("w1.1", {
        pid: 4321,
        processImage: "node.exe",
        spawnedAt: "2026-01-01T00:01:00.500Z",
      });
      const updated = runs.get("w1.1");
      expect(updated?.pid).toBe(4321);
      expect(updated?.processImage).toBe("node.exe");
      expect(updated?.spawnedAt).toBe("2026-01-01T00:01:00.500Z");
    });

    it("失败收尾：failReason / errorMessage / endedAt / exitCode 一起改", () => {
      const { runs } = setup();
      runs.insert(createRunRecord({ id: "w1.1", workerId: "w1", status: "running" }));
      runs.update("w1.1", {
        status: "failed",
        failReason: "exit_code",
        errorMessage: "进程异常退出",
        endedAt: "2026-01-01T00:02:00.000Z",
        exitCode: 1,
      });
      const updated = runs.get("w1.1");
      expect(updated).toMatchObject({
        status: "failed",
        failReason: "exit_code",
        errorMessage: "进程异常退出",
        endedAt: "2026-01-01T00:02:00.000Z",
        exitCode: 1,
      });
    });

    it("usage 整体替换", () => {
      const { runs } = setup();
      runs.insert(createRunRecord({ id: "w1.1", workerId: "w1" }));
      const usage = {
        inputTokens: 5,
        outputTokens: 6,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        totalTokens: 11,
        costUsd: null,
      };
      runs.update("w1.1", { usage });
      expect(runs.get("w1.1")?.usage).toEqual(usage);
    });

    it("retry 先设置再清空", () => {
      const { runs } = setup();
      runs.insert(createRunRecord({ id: "w1.1", workerId: "w1", retry: null }));
      runs.update("w1.1", { retry: { attempt: 1, max: 3, message: "重试中" } });
      expect(runs.get("w1.1")?.retry).toEqual({ attempt: 1, max: 3, message: "重试中" });
      runs.update("w1.1", { retry: null });
      expect(runs.get("w1.1")?.retry).toBeNull();
    });

    it("取消：killedBy 改成 cancel", () => {
      const { runs } = setup();
      runs.insert(createRunRecord({ id: "w1.1", workerId: "w1", status: "queued" }));
      runs.update("w1.1", {
        status: "cancelled",
        killedBy: "cancel",
        endedAt: "2026-01-01T00:00:05.000Z",
      });
      expect(runs.get("w1.1")?.killedBy).toBe("cancel");
    });
  });
});
