import type { DatabaseSync } from "node:sqlite";
import type { WorkerRecord } from "@fleet/core";
import { mapWorkerRow } from "./rowMappers.js";
import type { WorkerPatch, WorkerRepo } from "./types.js";

/** 单条语句最多绑定的编号个数；批量查询/删除超过这个数就分批，避开 SQLite 参数个数上限。 */
const BATCH_SIZE = 500;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * 苦工仓库。update 只按 patch 里出现的键拼 SET 子句：没出现的键不动，patch 为空对象什么都不做。
 */
export function createWorkerRepo(db: DatabaseSync): WorkerRepo {
  const getStmt = db.prepare("SELECT * FROM workers WHERE id = ?;");
  const existsStmt = db.prepare("SELECT 1 FROM workers WHERE id = ? LIMIT 1;");
  const insertStmt = db.prepare(
    `INSERT INTO workers
       (id, project_key, cwd, title, role, runtime, pool_id, model, thinking, session_ref,
        created_at, latest_run_seq, requested_pool, channel, model_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
  );
  const listRecentAllStmt = db.prepare("SELECT * FROM workers ORDER BY created_at DESC LIMIT ?;");
  const listRecentByProjectStmt = db.prepare(
    "SELECT * FROM workers WHERE project_key = ? ORDER BY created_at DESC LIMIT ?;",
  );

  return {
    get(id: string): WorkerRecord | null {
      const row = getStmt.get(id);
      return row === undefined ? null : mapWorkerRow(row);
    },

    exists(id: string): boolean {
      return existsStmt.get(id) !== undefined;
    },

    insert(worker: WorkerRecord): void {
      insertStmt.run(
        worker.id,
        worker.projectKey,
        worker.cwd,
        worker.title,
        worker.role,
        worker.runtime,
        worker.poolId,
        worker.model,
        worker.thinking,
        worker.sessionRef,
        worker.createdAt,
        worker.latestRunSeq,
        worker.requestedPool,
        worker.channel,
        worker.modelName,
      );
    },

    update(id: string, patch: WorkerPatch): void {
      const assignments: string[] = [];
      const values: (string | number | null)[] = [];
      if (patch.sessionRef !== undefined) {
        assignments.push("session_ref = ?");
        values.push(patch.sessionRef);
      }
      if (patch.latestRunSeq !== undefined) {
        assignments.push("latest_run_seq = ?");
        values.push(patch.latestRunSeq);
      }
      if (patch.poolId !== undefined) {
        assignments.push("pool_id = ?");
        values.push(patch.poolId);
      }
      if (patch.model !== undefined) {
        assignments.push("model = ?");
        values.push(patch.model);
      }
      if (patch.channel !== undefined) {
        assignments.push("channel = ?");
        values.push(patch.channel);
      }
      if (patch.modelName !== undefined) {
        assignments.push("model_name = ?");
        values.push(patch.modelName);
      }
      if (assignments.length === 0) {
        return;
      }
      db.prepare(`UPDATE workers SET ${assignments.join(", ")} WHERE id = ?;`).run(...values, id);
    },

    listByIds(ids: readonly string[]): WorkerRecord[] {
      const results: WorkerRecord[] = [];
      for (const batch of chunk(ids, BATCH_SIZE)) {
        if (batch.length === 0) {
          continue;
        }
        const placeholders = batch.map(() => "?").join(", ");
        const rows = db
          .prepare(`SELECT * FROM workers WHERE id IN (${placeholders});`)
          .all(...batch);
        for (const row of rows) {
          results.push(mapWorkerRow(row));
        }
      }
      return results;
    },

    listRecent(limit: number, projectKey?: string): WorkerRecord[] {
      const rows =
        projectKey === undefined
          ? listRecentAllStmt.all(limit)
          : listRecentByProjectStmt.all(projectKey, limit);
      return rows.map(mapWorkerRow);
    },

    deleteMany(ids: readonly string[]): void {
      for (const batch of chunk(ids, BATCH_SIZE)) {
        if (batch.length === 0) {
          continue;
        }
        const placeholders = batch.map(() => "?").join(", ");
        db.prepare(`DELETE FROM workers WHERE id IN (${placeholders});`).run(...batch);
      }
    },
  };
}
