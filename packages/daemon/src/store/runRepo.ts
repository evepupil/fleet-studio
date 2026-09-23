import type { DatabaseSync } from "node:sqlite";
import { isTerminalStatus, RUN_STATUSES, type RunRecord, TERMINAL_STATUSES } from "@fleet/core";
import { mapRunRow, readString, retryToJson, usageToJson } from "./rowMappers.js";
import type { RunPatch, RunRepo } from "./types.js";

/** 单条语句最多绑定的编号个数；批量查询超过这个数就分批，避开 SQLite 参数个数上限。 */
const BATCH_SIZE = 500;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/** 排队中和工作中，即「没结束」的状态；从 RUN_STATUSES 里减去终态得到，不手写字面量。 */
const ACTIVE_STATUSES = RUN_STATUSES.filter((status) => !isTerminalStatus(status));

/** 运行仓库。usage / retry 两列进出都要经过 rowMappers 的 JSON 编解码，其余列一一对应。 */
export function createRunRepo(db: DatabaseSync): RunRepo {
  const getStmt = db.prepare("SELECT * FROM runs WHERE id = ?;");
  const insertStmt = db.prepare(
    `INSERT INTO runs (
       id, worker_id, seq, prompt, status, fail_reason, error_message,
       queued_at, started_at, ended_at, timeout_ms, queue_timeout_ms,
       pid, process_image, spawned_at, exit_code, killed_by, usage_json, retry_json,
       activity, last_activity_at, final_text, event_count
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
  );
  const listByWorkerStmt = db.prepare("SELECT * FROM runs WHERE worker_id = ? ORDER BY seq ASC;");
  const listActiveStmt = db.prepare(
    `SELECT * FROM runs
     WHERE status IN (${ACTIVE_STATUSES.map(() => "?").join(", ")})
     ORDER BY queued_at ASC;`,
  );
  const listEndedSinceStmt = db.prepare(
    "SELECT * FROM runs WHERE ended_at >= ? ORDER BY ended_at ASC;",
  );
  const listStartedSinceStmt = db.prepare(
    "SELECT * FROM runs WHERE started_at >= ? ORDER BY started_at ASC;",
  );
  const listExpiredWorkerIdsStmt = db.prepare(
    `SELECT workers.id AS worker_id
     FROM workers
     JOIN runs ON runs.worker_id = workers.id AND runs.seq = workers.latest_run_seq
     WHERE runs.status IN (${TERMINAL_STATUSES.map(() => "?").join(", ")})
       AND runs.ended_at < ?;`,
  );

  return {
    get(id: string): RunRecord | null {
      const row = getStmt.get(id);
      return row === undefined ? null : mapRunRow(row);
    },

    insert(run: RunRecord): void {
      insertStmt.run(
        run.id,
        run.workerId,
        run.seq,
        run.prompt,
        run.status,
        run.failReason,
        run.errorMessage,
        run.queuedAt,
        run.startedAt,
        run.endedAt,
        run.timeoutMs,
        run.queueTimeoutMs,
        run.pid,
        run.processImage,
        run.spawnedAt,
        run.exitCode,
        run.killedBy,
        usageToJson(run.usage),
        retryToJson(run.retry),
        run.activity,
        run.lastActivityAt,
        run.finalText,
        run.eventCount,
      );
    },

    update(id: string, patch: RunPatch): void {
      const assignments: string[] = [];
      const values: (string | number | null)[] = [];

      if (patch.status !== undefined) {
        assignments.push("status = ?");
        values.push(patch.status);
      }
      if (patch.failReason !== undefined) {
        assignments.push("fail_reason = ?");
        values.push(patch.failReason);
      }
      if (patch.errorMessage !== undefined) {
        assignments.push("error_message = ?");
        values.push(patch.errorMessage);
      }
      if (patch.startedAt !== undefined) {
        assignments.push("started_at = ?");
        values.push(patch.startedAt);
      }
      if (patch.endedAt !== undefined) {
        assignments.push("ended_at = ?");
        values.push(patch.endedAt);
      }
      if (patch.timeoutMs !== undefined) {
        assignments.push("timeout_ms = ?");
        values.push(patch.timeoutMs);
      }
      if (patch.queueTimeoutMs !== undefined) {
        assignments.push("queue_timeout_ms = ?");
        values.push(patch.queueTimeoutMs);
      }
      if (patch.pid !== undefined) {
        assignments.push("pid = ?");
        values.push(patch.pid);
      }
      if (patch.processImage !== undefined) {
        assignments.push("process_image = ?");
        values.push(patch.processImage);
      }
      if (patch.spawnedAt !== undefined) {
        assignments.push("spawned_at = ?");
        values.push(patch.spawnedAt);
      }
      if (patch.exitCode !== undefined) {
        assignments.push("exit_code = ?");
        values.push(patch.exitCode);
      }
      if (patch.killedBy !== undefined) {
        assignments.push("killed_by = ?");
        values.push(patch.killedBy);
      }
      if (patch.usage !== undefined) {
        assignments.push("usage_json = ?");
        values.push(usageToJson(patch.usage));
      }
      if (patch.retry !== undefined) {
        assignments.push("retry_json = ?");
        values.push(retryToJson(patch.retry));
      }
      if (patch.activity !== undefined) {
        assignments.push("activity = ?");
        values.push(patch.activity);
      }
      if (patch.lastActivityAt !== undefined) {
        assignments.push("last_activity_at = ?");
        values.push(patch.lastActivityAt);
      }
      if (patch.finalText !== undefined) {
        assignments.push("final_text = ?");
        values.push(patch.finalText);
      }
      if (patch.eventCount !== undefined) {
        assignments.push("event_count = ?");
        values.push(patch.eventCount);
      }

      if (assignments.length === 0) {
        return;
      }
      db.prepare(`UPDATE runs SET ${assignments.join(", ")} WHERE id = ?;`).run(...values, id);
    },

    listByWorker(workerId: string): RunRecord[] {
      return listByWorkerStmt.all(workerId).map(mapRunRow);
    },

    listByWorkers(workerIds: readonly string[]): RunRecord[] {
      const results: RunRecord[] = [];
      for (const batch of chunk(workerIds, BATCH_SIZE)) {
        if (batch.length === 0) {
          continue;
        }
        const placeholders = batch.map(() => "?").join(", ");
        const rows = db
          .prepare(`SELECT * FROM runs WHERE worker_id IN (${placeholders});`)
          .all(...batch);
        for (const row of rows) {
          results.push(mapRunRow(row));
        }
      }
      // 分批查询时，批次之间彼此的顺序和苦工编号大小无关；这里统一在内存里排一次，
      // 保证不管有没有分批，结果都按苦工编号、序号升序。
      results.sort((a, b) => {
        if (a.workerId !== b.workerId) {
          return a.workerId < b.workerId ? -1 : 1;
        }
        return a.seq - b.seq;
      });
      return results;
    },

    listActive(): RunRecord[] {
      return listActiveStmt.all(...ACTIVE_STATUSES).map(mapRunRow);
    },

    listEndedSince(since: string): RunRecord[] {
      return listEndedSinceStmt.all(since).map(mapRunRow);
    },

    listStartedSince(since: string): RunRecord[] {
      return listStartedSinceStmt.all(since).map(mapRunRow);
    },

    listExpiredWorkerIds(before: string): string[] {
      const rows = listExpiredWorkerIdsStmt.all(...TERMINAL_STATUSES, before);
      return rows.map((row) => readString(row, "worker_id", "workers"));
    },
  };
}
