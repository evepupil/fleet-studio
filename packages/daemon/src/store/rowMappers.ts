import {
  FAIL_REASONS,
  FleetError,
  type ProjectRecord,
  type RetryInfo,
  RUN_STATUSES,
  RUNTIME_IDS,
  type RunFact,
  type RunRecord,
  THINKING_LEVELS,
  type Usage,
  type WorkerFact,
  type WorkerRecord,
} from "@fleet/core";

/**
 * 数据库行（node:sqlite 读出来的宽松类型）和领域记录之间的转换与校验。
 * `all()` / `get()` 返回的每一列拿到手都是未知类型，这里逐列用 typeof 收窄再赋值，不强转；
 * 收窄失败说明数据库文件被外部改坏了，统一抛 FleetError("internal", ...)。
 */

/** killed_by 列允许的取值（不含 null）。KilledBy 是手写的字面量联合类型，契约里没有对应的常量数组。 */
const KILLED_BY_VALUES = ["cancel", "timeout"] as const;

function corrupted(table: string, column: string, value: unknown): FleetError {
  return new FleetError("internal", `数据库记录损坏：${table}.${column} = ${String(value)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * usage_json / retry_json 解析出来之后，用没有索引签名的形状接一次，
 * 才能用字面量属性访问（`shape.attempt`）而不是 `shape["attempt"]`——
 * `Record<string, unknown>` 本身带索引签名，按 tsconfig 的
 * noPropertyAccessFromIndexSignature 规则只能用方括号取值。
 * `Record<string, unknown>` 赋值给下面这两个形状是结构兼容的普通赋值，不是强转。
 */
interface RetryShape {
  attempt?: unknown;
  max?: unknown;
  message?: unknown;
}

/**
 * value 是否属于 allowed 列表。allowed 声明成 `readonly T[]`（T extends string），
 * 协变到 `readonly string[]` 是安全的赋值，不需要 as。
 */
function isMember<T extends string>(value: string, allowed: readonly T[]): value is T {
  const list: readonly string[] = allowed;
  return list.includes(value);
}

export function readString(row: Record<string, unknown>, column: string, table: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw corrupted(table, column, value);
  }
  return value;
}

export function readNullableString(
  row: Record<string, unknown>,
  column: string,
  table: string,
): string | null {
  const value = row[column];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw corrupted(table, column, value);
  }
  return value;
}

export function readInteger(row: Record<string, unknown>, column: string, table: string): number {
  const value = row[column];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw corrupted(table, column, value);
  }
  return value;
}

export function readNullableInteger(
  row: Record<string, unknown>,
  column: string,
  table: string,
): number | null {
  const value = row[column];
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw corrupted(table, column, value);
  }
  return value;
}

export function readNullableNumber(
  row: Record<string, unknown>,
  column: string,
  table: string,
): number | null {
  const value = row[column];
  if (value === null) {
    return null;
  }
  // 只查 typeof 会放行正负无穷（费用列一旦被写成 Infinity，下游统计会被污染），
  // 口径和 readNonNegativeNumber 一致：不是有限数字就算记录损坏。
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw corrupted(table, column, value);
  }
  return value;
}

export function readNonNegativeNumber(
  row: Record<string, unknown>,
  column: string,
  table: string,
): number {
  const value = row[column];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw corrupted(table, column, value);
  }
  return value;
}

export function readEnum<T extends string>(
  row: Record<string, unknown>,
  column: string,
  table: string,
  allowed: readonly T[],
): T {
  const value = row[column];
  if (typeof value === "string" && isMember(value, allowed)) {
    return value;
  }
  throw corrupted(table, column, value);
}

export function readNullableEnum<T extends string>(
  row: Record<string, unknown>,
  column: string,
  table: string,
  allowed: readonly T[],
): T | null {
  const value = row[column];
  if (value === null) {
    return null;
  }
  if (typeof value === "string" && isMember(value, allowed)) {
    return value;
  }
  throw corrupted(table, column, value);
}

export function readUsage(row: Record<string, unknown>, table: string): Usage {
  return {
    inputTokens: readNonNegativeNumber(row, "input_tokens", table),
    outputTokens: readNonNegativeNumber(row, "output_tokens", table),
    cacheReadTokens: readNonNegativeNumber(row, "cache_read_tokens", table),
    cacheWriteTokens: readNonNegativeNumber(row, "cache_write_tokens", table),
    totalTokens: readNonNegativeNumber(row, "total_tokens", table),
    costUsd: readNullableNumber(row, "cost_usd", table),
  };
}

/** retry_json：正在自动重试时的信息；不在重试时整列为 null。 */
export function readRetry(
  row: Record<string, unknown>,
  column: string,
  table: string,
): RetryInfo | null {
  const value = row[column];
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw corrupted(table, column, value);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw corrupted(table, column, value);
  }
  if (!isRecord(parsed)) {
    throw corrupted(table, column, value);
  }
  const shape: RetryShape = parsed;
  const attempt = shape.attempt;
  const max = shape.max;
  const message = shape.message;
  if (typeof attempt !== "number" || typeof max !== "number" || typeof message !== "string") {
    throw corrupted(table, column, value);
  }
  return { attempt, max, message };
}

export function retryToJson(retry: RetryInfo | null): string | null {
  return retry === null ? null : JSON.stringify(retry);
}

export function mapProjectRow(row: Record<string, unknown>): ProjectRecord {
  return {
    key: readString(row, "key", "projects"),
    path: readString(row, "path", "projects"),
    name: readString(row, "name", "projects"),
    colorIndex: readInteger(row, "color_index", "projects"),
    createdAt: readString(row, "created_at", "projects"),
  };
}

export function mapWorkerRow(row: Record<string, unknown>): WorkerRecord {
  return {
    id: readString(row, "id", "workers"),
    projectKey: readString(row, "project_key", "workers"),
    cwd: readString(row, "cwd", "workers"),
    title: readString(row, "title", "workers"),
    role: readString(row, "role", "workers"),
    runtime: readEnum(row, "runtime", "workers", RUNTIME_IDS),
    poolId: readNullableString(row, "pool_id", "workers"),
    model: readNullableString(row, "model", "workers"),
    channel: readNullableString(row, "channel", "workers"),
    modelName: readNullableString(row, "model_name", "workers"),
    requestedPool: readNullableString(row, "requested_pool", "workers"),
    thinking: readNullableEnum(row, "thinking", "workers", THINKING_LEVELS),
    sessionRef: readNullableString(row, "session_ref", "workers"),
    createdAt: readString(row, "created_at", "workers"),
    latestRunSeq: readInteger(row, "latest_run_seq", "workers"),
  };
}

export function mapWorkerFactRow(row: Record<string, unknown>): WorkerFact {
  return {
    workerId: readString(row, "id", "workers"),
    createdAt: readString(row, "created_at", "workers"),
    projectKey: readString(row, "project_key", "workers"),
    role: readString(row, "role", "workers"),
    channel: readNullableString(row, "channel", "workers"),
    modelName: readNullableString(row, "model_name", "workers"),
  };
}

export function mapRunFactRow(row: Record<string, unknown>): RunFact {
  return {
    runId: readString(row, "id", "runs"),
    workerId: readString(row, "worker_id", "runs"),
    startedAt: readString(row, "started_at", "runs"),
    endedAt: readNullableString(row, "ended_at", "runs"),
    runMs: readNullableInteger(row, "run_ms", "runs"),
    inputTokens: readNonNegativeNumber(row, "input_tokens", "runs"),
    outputTokens: readNonNegativeNumber(row, "output_tokens", "runs"),
    cacheReadTokens: readNonNegativeNumber(row, "cache_read_tokens", "runs"),
    cacheWriteTokens: readNonNegativeNumber(row, "cache_write_tokens", "runs"),
    totalTokens: readNonNegativeNumber(row, "total_tokens", "runs"),
    costUsd: readNullableNumber(row, "cost_usd", "runs"),
  };
}

export function mapRunRow(row: Record<string, unknown>): RunRecord {
  return {
    id: readString(row, "id", "runs"),
    workerId: readString(row, "worker_id", "runs"),
    seq: readInteger(row, "seq", "runs"),
    prompt: readString(row, "prompt", "runs"),
    status: readEnum(row, "status", "runs", RUN_STATUSES),
    failReason: readNullableEnum(row, "fail_reason", "runs", FAIL_REASONS),
    errorMessage: readNullableString(row, "error_message", "runs"),
    queuedAt: readString(row, "queued_at", "runs"),
    startedAt: readNullableString(row, "started_at", "runs"),
    endedAt: readNullableString(row, "ended_at", "runs"),
    timeoutMs: readInteger(row, "timeout_ms", "runs"),
    queueTimeoutMs: readNullableInteger(row, "queue_timeout_ms", "runs"),
    pid: readNullableInteger(row, "pid", "runs"),
    processImage: readNullableString(row, "process_image", "runs"),
    spawnedAt: readNullableString(row, "spawned_at", "runs"),
    exitCode: readNullableInteger(row, "exit_code", "runs"),
    killedBy: readNullableEnum(row, "killed_by", "runs", KILLED_BY_VALUES),
    usage: readUsage(row, "runs"),
    runMs: readNullableInteger(row, "run_ms", "runs"),
    retry: readRetry(row, "retry_json", "runs"),
    activity: readNullableString(row, "activity", "runs"),
    lastActivityAt: readNullableString(row, "last_activity_at", "runs"),
    finalText: readNullableString(row, "final_text", "runs"),
    eventCount: readInteger(row, "event_count", "runs"),
  };
}
