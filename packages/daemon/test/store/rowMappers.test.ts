import { describe, expect, it } from "vitest";
import { mapRunRow, mapWorkerRow } from "../../src/store/rowMappers.js";

function createRunRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "w1.1",
    worker_id: "w1",
    seq: 1,
    prompt: "任务",
    status: "completed",
    fail_reason: null,
    error_message: null,
    queued_at: "2026-01-01T00:00:00.000Z",
    started_at: "2026-01-01T00:00:00.000Z",
    ended_at: "2026-01-01T00:01:00.000Z",
    timeout_ms: 60_000,
    queue_timeout_ms: null,
    pid: null,
    process_image: null,
    spawned_at: null,
    exit_code: 0,
    killed_by: null,
    input_tokens: 10,
    output_tokens: 20,
    cache_read_tokens: 3,
    cache_write_tokens: 4,
    total_tokens: 37,
    cost_usd: null,
    run_ms: 60_000,
    retry_json: null,
    activity: null,
    last_activity_at: null,
    final_text: null,
    event_count: 0,
    ...overrides,
  };
}

describe("rowMappers / M5 字段", () => {
  it("苦工新字段和可空的池、模型正确映射", () => {
    expect(
      mapWorkerRow({
        id: "w1",
        project_key: "p1",
        cwd: "C:/work",
        title: "任务",
        role: "worker",
        runtime: "pi",
        requested_pool: "pool-a",
        pool_id: null,
        model: null,
        channel: null,
        model_name: null,
        thinking: null,
        session_ref: null,
        created_at: "2026-01-01T00:00:00.000Z",
        latest_run_seq: 1,
      }),
    ).toMatchObject({
      requestedPool: "pool-a",
      poolId: null,
      model: null,
      channel: null,
      modelName: null,
    });
  });

  it("运行用量各列和 runMs 映射成领域字段", () => {
    expect(mapRunRow(createRunRow())).toMatchObject({
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheReadTokens: 3,
        cacheWriteTokens: 4,
        totalTokens: 37,
        costUsd: null,
      },
      runMs: 60_000,
    });
  });

  it("用量不是有限非负数字时指出损坏的数据库列", () => {
    expect(() => mapRunRow(createRunRow({ input_tokens: Number.POSITIVE_INFINITY }))).toThrow(
      "数据库记录损坏：runs.input_tokens = Infinity",
    );
    expect(() => mapRunRow(createRunRow({ total_tokens: -1 }))).toThrow(
      "数据库记录损坏：runs.total_tokens = -1",
    );
  });

  it("费用不是有限数字时也报数据库记录损坏", () => {
    expect(() => mapRunRow(createRunRow({ cost_usd: Number.POSITIVE_INFINITY }))).toThrow(
      "数据库记录损坏：runs.cost_usd = Infinity",
    );
    expect(() => mapRunRow(createRunRow({ cost_usd: Number.NEGATIVE_INFINITY }))).toThrow(
      "数据库记录损坏：runs.cost_usd = -Infinity",
    );
    // 正常取值为 null 或有限数字时不受影响。
    expect(mapRunRow(createRunRow({ cost_usd: 0.125 })).usage.costUsd).toBe(0.125);
    expect(mapRunRow(createRunRow({ cost_usd: null })).usage.costUsd).toBeNull();
  });
});
