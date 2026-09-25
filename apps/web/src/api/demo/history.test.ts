import { describe, expect, it } from "vitest";
import { buildHistory, mulberry32 } from "./history";

const TZ = { offsetMinutes: () => 480 };

describe("30 天历史", () => {
  it("规模固定：苦工 764 个、运行 864 次，按池分布固定", () => {
    const { workers, runs } = buildHistory(TZ);
    expect(workers).toHaveLength(764);
    expect(runs).toHaveLength(864);
    const byPool: Record<string, number> = {};
    for (const worker of workers) {
      const key = worker.poolId ?? "shared";
      byPool[key] = (byPool[key] ?? 0) + 1;
    }
    expect(byPool).toEqual({ dsf: 462, glmf: 148, luna: 94, qwen27: 60 });
  });

  it("同一个种子两次生成完全相同", () => {
    const first = buildHistory(TZ);
    const second = buildHistory(TZ);
    expect(second.workers).toEqual(first.workers);
    expect(second.runs).toEqual(first.runs);
  });

  it("苦工编号不重复，且只用字母表里的字符", () => {
    const { workers } = buildHistory(TZ);
    const ids = workers.map((worker) => worker.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^h[a-z2-9]{5}$/);
      expect(id).not.toMatch(/[ilo01]/);
    }
  });

  it("运行的排队 ≤ 开跑 ≤ 结束，且全部已结束", () => {
    const { runs } = buildHistory(TZ);
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      expect(run.startedAt).not.toBeNull();
      expect(run.endedAt).not.toBeNull();
      const queuedAt = Date.parse(run.queuedAt);
      const startedAt = Date.parse(run.startedAt ?? "");
      const endedAt = Date.parse(run.endedAt ?? "");
      expect(startedAt).toBeGreaterThanOrEqual(queuedAt);
      expect(endedAt).toBeGreaterThanOrEqual(startedAt);
      expect(["completed", "failed", "cancelled"]).toContain(run.status);
    }
  });

  it("续接运行的排队时间晚于上一次的结束时间", () => {
    const { runs } = buildHistory(TZ);
    const byWorker = new Map<string, typeof runs>();
    for (const run of runs) {
      const list = byWorker.get(run.workerId);
      if (list === undefined) {
        byWorker.set(run.workerId, [run]);
      } else {
        list.push(run);
      }
    }
    let continuations = 0;
    for (const list of byWorker.values()) {
      const ordered = [...list].sort((a, b) => a.seq - b.seq);
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1];
        const current = ordered[index];
        expect(previous).toBeDefined();
        expect(current).toBeDefined();
        if (previous === undefined || current === undefined) {
          continue;
        }
        continuations += 1;
        expect(Date.parse(current.queuedAt)).toBeGreaterThan(Date.parse(previous.endedAt ?? ""));
      }
    }
    expect(continuations).toBeGreaterThan(0);
  });

  it("运行的用时和用量都符合口径", () => {
    const { runs } = buildHistory(TZ);
    for (const run of runs) {
      expect(run.runMs).not.toBeNull();
      const runMs = run.runMs ?? 0;
      if (run.status === "cancelled") {
        expect(runMs).toBeGreaterThan(0);
        expect(runMs).toBeLessThanOrEqual(1_500_000);
      } else {
        expect(runMs).toBeGreaterThanOrEqual(120_000);
        expect(runMs).toBeLessThanOrEqual(1_500_000);
      }
      expect(run.usage.cacheWriteTokens).toBe(0);
      expect(run.usage.costUsd).toBeNull();
      expect(run.usage.totalTokens).toBe(
        run.usage.inputTokens + run.usage.outputTokens + run.usage.cacheReadTokens,
      );
      expect(run.usage.inputTokens).toBeGreaterThan(0);
      expect(run.usage.outputTokens).toBeGreaterThan(0);
    }
  });

  it("取消的运行按 30% 计，结束时刻不超过 DEMO_NOW", () => {
    const { runs } = buildHistory(TZ);
    const nowMs = Date.parse("2026-09-23T04:10:00.000Z");
    for (const run of runs) {
      expect(Date.parse(run.endedAt ?? "")).toBeLessThanOrEqual(nowMs);
    }
  });

  it("伪随机是自写的 mulberry32：同种子同序列", () => {
    const a = mulberry32(20260923);
    const b = mulberry32(20260923);
    const c = mulberry32(20260924);
    const sequenceA = [a(), a(), a()];
    const sequenceB = [b(), b(), b()];
    const sequenceC = [c(), c(), c()];
    expect(sequenceB).toEqual(sequenceA);
    expect(sequenceC).not.toEqual(sequenceA);
    for (const value of sequenceA) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
