import type { DatabaseSync } from "node:sqlite";
import {
  FleetError,
  type TaskSortKey,
  type TaskStatusFilter,
  type WorkerRecord,
} from "@fleet/core";
import { mapWorkerRow, readInteger } from "./rowMappers.js";
import type { TaskQueryInput, TaskRepo } from "./types.js";

interface Cursor {
  sort: TaskSortKey;
  value: string | number;
  id: string;
}

interface QueryParts {
  whereSql: string;
  values: string[];
}

const INVALID_CURSOR_MESSAGE = "翻页参数无效，请从第一页重新加载";

export function createTaskRepo(db: DatabaseSync): TaskRepo {
  return {
    query(input: TaskQueryInput): {
      workers: WorkerRecord[];
      total: number;
      nextCursor: string | null;
    } {
      const filters = buildFilters(input);
      const totalRow = db
        .prepare(
          `SELECT COUNT(*) AS total
           FROM workers AS w
           LEFT JOIN runs AS latest
             ON latest.worker_id = w.id AND latest.seq = w.latest_run_seq
           WHERE ${filters.whereSql};`,
        )
        .get(...filters.values);
      if (totalRow === undefined) {
        throw new FleetError("internal", "任务查询未返回总数");
      }
      const total = readInteger(totalRow, "total", "workers");
      const sortColumn = getSortColumn(input.sort);
      const cursor = input.cursor === undefined ? null : decodeCursor(input.cursor, input.sort);
      const cursorSql = cursor === null ? "" : `WHERE ${cursorCondition(sortColumn, input.order)}`;
      const order = input.order === "asc" ? "ASC" : "DESC";
      const values: (string | number)[] = [...filters.values];
      if (cursor !== null) {
        values.push(cursor.value, cursor.value, cursor.id);
      }
      values.push(input.limit);

      const rows = db
        .prepare(
          `WITH task_metrics AS (
             SELECT w.*,
                    COALESCE(SUM(all_runs.run_ms), 0) AS total_run_ms,
                    COALESCE(SUM(all_runs.total_tokens), 0) AS total_tokens
             FROM workers AS w
             LEFT JOIN runs AS latest
               ON latest.worker_id = w.id AND latest.seq = w.latest_run_seq
             LEFT JOIN runs AS all_runs ON all_runs.worker_id = w.id
             WHERE ${filters.whereSql}
             GROUP BY w.id
           )
           SELECT * FROM task_metrics
           ${cursorSql}
           ORDER BY ${sortColumn} ${order}, id ${order}
           LIMIT ?;`,
        )
        .all(...values);
      const workers = rows.map(mapWorkerRow);
      let nextCursor: string | null = null;
      if (rows.length === input.limit && rows.length > 0) {
        const lastRow = rows.at(-1);
        const lastWorker = workers.at(-1);
        if (lastRow === undefined || lastWorker === undefined) {
          throw new FleetError("internal", "任务翻页结果缺少末行，无法生成翻页参数");
        }
        nextCursor = encodeCursor(input.sort, readSortValue(lastRow, input.sort), lastWorker.id);
      }

      return { workers, total, nextCursor };
    },
  };
}

function buildFilters(input: TaskQueryInput): QueryParts {
  const conditions = ["w.created_at < ?"];
  const values: string[] = [input.createdTo];
  if (input.createdFrom !== null) {
    conditions.push("w.created_at >= ?");
    values.push(input.createdFrom);
  }
  if (input.projectKey !== undefined) {
    conditions.push("w.project_key = ?");
    values.push(input.projectKey);
  }
  if (input.poolId !== undefined) {
    conditions.push("w.pool_id = ?");
    values.push(input.poolId);
  }
  if (input.role !== undefined) {
    conditions.push("w.role = ?");
    values.push(input.role);
  }
  if (input.channel !== undefined) {
    conditions.push("w.channel = ?");
    values.push(input.channel);
  }
  if (input.modelName !== undefined) {
    conditions.push("w.model_name = ?");
    values.push(input.modelName);
  }
  if (input.titleContains !== undefined) {
    const escaped = input.titleContains.replace(/[\\%_]/g, (match) => `\\${match}`);
    conditions.push("w.title LIKE ? ESCAPE '\\'");
    values.push(`%${escaped}%`);
  }
  appendStatusFilter(conditions, values, input.status);
  return { whereSql: conditions.join(" AND "), values };
}

function appendStatusFilter(
  conditions: string[],
  values: string[],
  status: TaskStatusFilter,
): void {
  switch (status) {
    case "all":
      return;
    case "active":
      conditions.push("latest.status IN ('queued', 'running')");
      return;
    case "retrying":
      conditions.push("latest.status = 'running' AND latest.retry_json IS NOT NULL");
      return;
    default:
      conditions.push("latest.status = ?");
      values.push(status);
  }
}

function getSortColumn(sort: TaskSortKey): string {
  switch (sort) {
    case "createdAt":
      return "created_at";
    case "runMs":
      return "total_run_ms";
    case "tokens":
      return "total_tokens";
  }
}

function cursorCondition(sortColumn: string, order: "asc" | "desc"): string {
  const comparator = order === "asc" ? ">" : "<";
  return `(${sortColumn} ${comparator} ? OR (${sortColumn} = ? AND id ${comparator} ?))`;
}

function decodeCursor(encoded: string, expectedSort: TaskSortKey): Cursor {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("bad encoding");
    const decoded = Buffer.from(encoded, "base64url");
    if (decoded.toString("base64url") !== encoded) throw new Error("non-canonical encoding");
    const parsed: unknown = JSON.parse(decoded.toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("bad cursor shape");
    }
    const shape: { sort?: unknown; value?: unknown; id?: unknown } = parsed;
    const value = shape.value;
    const id = shape.id;
    if (shape.sort !== expectedSort || typeof id !== "string" || id.length === 0) {
      throw new Error("cursor does not match query");
    }
    if (expectedSort === "createdAt") {
      if (typeof value !== "string") throw new Error("invalid cursor value");
      return { sort: expectedSort, value, id };
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("invalid cursor value");
    }
    return { sort: expectedSort, value, id };
  } catch {
    throw new FleetError("invalid_request", INVALID_CURSOR_MESSAGE);
  }
}

function encodeCursor(sort: TaskSortKey, value: string | number, id: string): string {
  return Buffer.from(JSON.stringify({ sort, value, id }), "utf8").toString("base64url");
}

function readSortValue(row: Record<string, unknown>, sort: TaskSortKey): string | number {
  if (sort === "createdAt") {
    const shape: { created_at?: unknown } = row;
    const value = shape.created_at;
    if (typeof value !== "string") {
      throw new FleetError("internal", "任务排序时间不是文本");
    }
    return value;
  }
  const column = sort === "runMs" ? "total_run_ms" : "total_tokens";
  const value = row[column];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new FleetError("internal", `任务排序值不是数字：${column}`);
  }
  return value;
}
