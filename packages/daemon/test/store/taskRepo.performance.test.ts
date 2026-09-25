import { describe, expect, it } from "vitest";
import { createStatsRepo, createTaskRepo, openDatabase } from "../../src/store/index.js";

const WORKER_COUNT = 10_000;

describe("M5 存储性能", () => {
  it("一万苦工、三万运行下 runFacts 和任务分页查询各低于 500ms", () => {
    const db = openDatabase(":memory:");
    try {
      db.prepare(
        "INSERT INTO projects (key, path, name, color_index, created_at) VALUES (?, ?, ?, ?, ?);",
      ).run("p1", "C:/work", "work", 0, "2026-01-01T00:00:00.000Z");
      const insertWorker = db.prepare(
        `INSERT INTO workers
           (id, project_key, cwd, title, role, runtime, pool_id, model, thinking,
            session_ref, created_at, latest_run_seq, requested_pool, channel, model_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      );
      const insertRun = db.prepare(
        `INSERT INTO runs
           (id, worker_id, seq, prompt, status, queued_at, started_at, timeout_ms,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            total_tokens, run_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      );

      db.exec("BEGIN;");
      for (let workerIndex = 0; workerIndex < WORKER_COUNT; workerIndex += 1) {
        const workerId = `w${String(workerIndex).padStart(5, "0")}`;
        insertWorker.run(
          workerId,
          "p1",
          "C:/work",
          `task ${workerIndex}`,
          "worker",
          "pi",
          "pool-a",
          "provider/model",
          null,
          null,
          "2026-01-01T00:00:00.000Z",
          3,
          null,
          "provider",
          "model",
        );
        for (let seq = 1; seq <= 3; seq += 1) {
          insertRun.run(
            `${workerId}.${seq}`,
            workerId,
            seq,
            "prompt",
            "completed",
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:01.000Z",
            60_000,
            10,
            20,
            1,
            2,
            33,
            100,
          );
        }
      }
      db.exec("COMMIT;");

      const stats = createStatsRepo(db);
      const tasks = createTaskRepo(db);
      const factsStart = performance.now();
      expect(stats.runFacts(null)).toHaveLength(WORKER_COUNT * 3);
      const factsElapsed = performance.now() - factsStart;

      const queryStart = performance.now();
      expect(
        tasks.query({
          status: "all",
          createdFrom: null,
          createdTo: "2027-01-01T00:00:00.000Z",
          sort: "runMs",
          order: "desc",
          limit: 50,
        }).workers,
      ).toHaveLength(50);
      const queryElapsed = performance.now() - queryStart;

      expect(factsElapsed).toBeLessThan(500);
      expect(queryElapsed).toBeLessThan(500);
    } finally {
      db.close();
    }
  }, 30_000);
});
