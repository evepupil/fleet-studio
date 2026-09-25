import type { DatabaseSync } from "node:sqlite";
import type { RunFact, WorkerFact } from "@fleet/core";
import { FleetError, pickColorIndex } from "@fleet/core";
import { mapRunFactRow, mapWorkerFactRow, readInteger } from "./rowMappers.js";
import type { StatsRepo } from "./types.js";

const BATCH_SIZE = 500;

type SeriesKind = "model" | "channel" | "role";

export function createStatsRepo(db: DatabaseSync): StatsRepo {
  const runFactsAllStmt = db.prepare(
    `SELECT id, worker_id, started_at, ended_at, run_ms, input_tokens, output_tokens,
            cache_read_tokens, cache_write_tokens, total_tokens, cost_usd
     FROM runs WHERE started_at IS NOT NULL ORDER BY started_at ASC, id ASC;`,
  );
  const runFactsSinceStmt = db.prepare(
    `SELECT id, worker_id, started_at, ended_at, run_ms, input_tokens, output_tokens,
            cache_read_tokens, cache_write_tokens, total_tokens, cost_usd
     FROM runs WHERE started_at IS NOT NULL AND started_at >= ? ORDER BY started_at ASC, id ASC;`,
  );
  const workerFactsAllStmt = db.prepare(
    `SELECT id, created_at, project_key, role, channel, model_name
     FROM workers ORDER BY created_at ASC, id ASC;`,
  );
  const workerFactsSinceStmt = db.prepare(
    `SELECT id, created_at, project_key, role, channel, model_name
     FROM workers WHERE created_at >= ? ORDER BY created_at ASC, id ASC;`,
  );
  const seriesColorStmt = db.prepare(
    "SELECT color_index FROM series_colors WHERE kind = ? AND name = ?;",
  );
  const usedSeriesColorsStmt = db.prepare("SELECT color_index FROM series_colors WHERE kind = ?;");
  const insertSeriesColorStmt = db.prepare(
    `INSERT INTO series_colors (kind, name, color_index, created_at)
     VALUES (?, ?, ?, ?) ON CONFLICT(kind, name) DO NOTHING;`,
  );

  return {
    runFacts(sinceIso: string | null): RunFact[] {
      const rows = sinceIso === null ? runFactsAllStmt.all() : runFactsSinceStmt.all(sinceIso);
      return rows.map(mapRunFactRow);
    },

    workerFacts(sinceIso: string | null, alsoIds: readonly string[]): WorkerFact[] {
      const facts = new Map<string, WorkerFact>();
      const baseRows =
        sinceIso === null ? workerFactsAllStmt.all() : workerFactsSinceStmt.all(sinceIso);
      for (const row of baseRows) {
        const fact = mapWorkerFactRow(row);
        facts.set(fact.workerId, fact);
      }
      if (sinceIso === null) {
        return [...facts.values()];
      }

      const missingIds = [...new Set(alsoIds)].filter((id) => !facts.has(id));
      for (let offset = 0; offset < missingIds.length; offset += BATCH_SIZE) {
        const batch = missingIds.slice(offset, offset + BATCH_SIZE);
        if (batch.length === 0) continue;
        const placeholders = batch.map(() => "?").join(", ");
        const rows = db
          .prepare(
            `SELECT id, created_at, project_key, role, channel, model_name
             FROM workers WHERE id IN (${placeholders});`,
          )
          .all(...batch);
        for (const row of rows) {
          const fact = mapWorkerFactRow(row);
          facts.set(fact.workerId, fact);
        }
      }
      return [...facts.values()];
    },

    seriesColor(kind: SeriesKind, name: string, nowIso: string): number {
      const existing = seriesColorStmt.get(kind, name);
      if (existing !== undefined) {
        return readInteger(existing, "color_index", "series_colors");
      }

      const used = usedSeriesColorsStmt
        .all(kind)
        .map((row) => readInteger(row, "color_index", "series_colors"));
      const colorIndex = pickColorIndex(used, name);
      insertSeriesColorStmt.run(kind, name, colorIndex, nowIso);

      const assigned = seriesColorStmt.get(kind, name);
      if (assigned === undefined) {
        throw new FleetError("internal", "统计配色写入后无法读取");
      }
      return readInteger(assigned, "color_index", "series_colors");
    },
  };
}
