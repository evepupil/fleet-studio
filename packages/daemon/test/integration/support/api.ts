/**
 * 对服务 HTTP 接口的最小封装：每个函数对应任务书要求「通过 HTTP 接口」验证的一个动作
 * （派活、等待、看回报、续接、取消、查容量……）。响应体一律用 readJsonBody 解出来，
 * 类型故意不收紧（见 http.ts 的说明）——测试用 vitest 的 expect 断言具体字段和值，
 * 类型系统这层不需要重复把关。
 */
import { API_PATHS, type RuntimeId } from "@fleet/core";
import type { Harness } from "./harness.js";
import { readJsonBody } from "./http.js";

export interface SubmitOptions {
  projectPath: string;
  /** 缺省等于 projectPath */
  cwd?: string;
  prompt: string;
  runtime?: RuntimeId;
  pool?: string;
  title?: string;
  timeoutMin?: number;
}

/** POST /api/workers：派活，断言用返回的 worker 摘要（状态、编号等）。 */
export async function submitWorker(harness: Harness, options: SubmitOptions) {
  const response = await harness.fetchWithToken(API_PATHS.workers, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectPath: options.projectPath,
      cwd: options.cwd ?? options.projectPath,
      prompt: options.prompt,
      ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
      ...(options.pool === undefined ? {} : { pool: options.pool }),
      ...(options.title === undefined ? {} : { title: options.title }),
      ...(options.timeoutMin === undefined ? {} : { timeoutMin: options.timeoutMin }),
    }),
  });
  if (response.status !== 201) {
    throw new Error(`派活失败：HTTP ${response.status}，响应体 ${await response.text()}`);
  }
  const body = await readJsonBody(response);
  return body.worker;
}

/** GET /api/workers/:id：不存在时返回 null，和服务本身的约定一致。 */
export async function getWorker(harness: Harness, id: string) {
  const response = await harness.fetch(API_PATHS.worker(id));
  if (response.status === 404) {
    return null;
  }
  return readJsonBody(response);
}

/** GET /api/workers/:id/timeline */
export async function getTimeline(harness: Harness, id: string, after = -1, limit = 500) {
  const query = new URLSearchParams({ after: String(after), limit: String(limit) });
  const response = await harness.fetch(`${API_PATHS.workerTimeline(id)}?${query.toString()}`);
  return readJsonBody(response);
}

/** GET /api/workers，project 传目录原始路径即可，服务会自己归一化。 */
export async function listWorkers(
  harness: Harness,
  query: { project?: string; status?: string } = {},
) {
  const params = new URLSearchParams();
  if (query.project !== undefined) {
    params.set("project", query.project);
  }
  if (query.status !== undefined) {
    params.set("status", query.status);
  }
  const search = params.toString();
  const path = search.length > 0 ? `${API_PATHS.workers}?${search}` : API_PATHS.workers;
  const response = await harness.fetch(path);
  return readJsonBody(response);
}

/** POST /api/workers/:id/cancel：返回状态码 + 解析后的响应体，409/404 场景也要能断言到。 */
export async function cancelWorker(harness: Harness, id: string) {
  const response = await harness.fetchWithToken(API_PATHS.workerCancel(id), { method: "POST" });
  const body = await readJsonBody(response);
  return { status: response.status, body };
}

/** POST /api/workers/:id/messages：续接，同样保留状态码，409 冲突场景要断言状态码和错误文案。 */
export async function sendMessage(harness: Harness, id: string, prompt: string) {
  const response = await harness.fetchWithToken(API_PATHS.workerMessages(id), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const body = await readJsonBody(response);
  return { status: response.status, body };
}

/** GET /api/wait：一次最多挂 timeoutSec（≤60）秒；需要更长就在测试里循环调用。 */
export async function waitForWorkers(
  harness: Harness,
  ids: readonly string[],
  mode: "all" | "any",
  timeoutSec: number,
) {
  const query = new URLSearchParams({ ids: ids.join(","), mode, timeoutSec: String(timeoutSec) });
  const response = await harness.fetch(`${API_PATHS.wait}?${query.toString()}`);
  return readJsonBody(response);
}

/** PATCH /api/pools/:id */
export async function patchPool(
  harness: Harness,
  poolId: string,
  patch: { capacity?: number; perProjectCap?: number | null },
) {
  const response = await harness.fetchWithToken(API_PATHS.pool(poolId), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await readJsonBody(response);
  return { status: response.status, body };
}

/** GET /api/pools */
export async function getPools(harness: Harness) {
  const response = await harness.fetch(API_PATHS.pools);
  return readJsonBody(response);
}

/** GET /api/snapshot */
export async function getSnapshot(harness: Harness) {
  const response = await harness.fetch(API_PATHS.snapshot);
  return readJsonBody(response);
}
