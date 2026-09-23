import { ERROR_CODES, type ErrorCode, TOKEN_HEADER } from "@fleet/core";
import { CliConnectionError } from "./errors.js";
import { isRecord, readField } from "./json.js";

/** 请求返回的错误信息不是合法的 ApiErrorBody 时，用这句话兜底。 */
const UNRECOGNIZED_ERROR_TEXT = "服务返回了无法识别的错误";

/** 服务按 ApiErrorBody 回的结构化错误：code 用于 main.ts 判定退出码，message 直接给人看。 */
export class FleetApiError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "FleetApiError";
    this.code = code;
  }
}

/** 查询参数的值；undefined 表示不带这个参数。 */
export type QueryValue = string | number | boolean | undefined;
export type QueryParams = Readonly<Record<string, QueryValue>>;

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && ERROR_CODES.some((code) => code === value);
}

function isApiErrorBody(value: unknown): value is { error: { code: ErrorCode; message: string } } {
  if (!isRecord(value)) {
    return false;
  }
  const error = readField(value, "error");
  if (!isRecord(error)) {
    return false;
  }
  return isErrorCode(readField(error, "code")) && typeof readField(error, "message") === "string";
}

/**
 * 把 JSON 文本解析成期望的类型：响应 DTO（Snapshot、WorkerSummary 等）只是 @fleet/core
 * 里的普通接口，没有配套的 zod 模式可以在运行时校验；服务是本机自己起的可信进程，这里选择
 * 直接信任并交给调用方标注的类型 T，而不是在命令行包里为每个 DTO 重复手写一遍结构校验
 * （那属于 core 的职责）。函数体不写 T 类型标注也不做 as 转换：JSON.parse 的返回值本身是
 * any，隐式适配到任意返回类型是 TS 允许的行为，不属于我们主动写 any / as。
 */
function parseJsonBody<T>(text: string): T {
  return JSON.parse(text);
}

async function toResponseError(
  status: number,
  bodyText: string,
): Promise<FleetApiError | CliConnectionError> {
  if (bodyText.length === 0) {
    return new CliConnectionError(`${UNRECOGNIZED_ERROR_TEXT}（状态码 ${status}，响应为空）`);
  }
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (isApiErrorBody(parsed)) {
      return new FleetApiError(parsed.error.code, parsed.error.message);
    }
  } catch {
    // 解析失败也走下面的兜底分支
  }
  return new CliConnectionError(`${UNRECOGNIZED_ERROR_TEXT}（状态码 ${status}）`);
}

function buildUrl(baseUrl: string, path: string, query: QueryParams | undefined): string {
  const url = new URL(path, baseUrl);
  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function describeNetworkError(error: unknown): string {
  return error instanceof Error ? error.message : "未知网络错误";
}

export interface FleetClient {
  /** 不带令牌的 GET；query 里 undefined 的字段会被跳过。 */
  getJson<T>(path: string, query?: QueryParams): Promise<T>;
  /** 带令牌的 POST，请求体按 JSON 发送。 */
  postJson<T>(path: string, body: unknown): Promise<T>;
  /** 带令牌的 PATCH，请求体按 JSON 发送。 */
  patchJson<T>(path: string, body: unknown): Promise<T>;
  /** 带令牌但没有请求体的 POST（取消、关停）。 */
  postEmpty<T>(path: string): Promise<T>;
}

interface RequestSpec {
  readonly method: "GET" | "POST" | "PATCH";
  readonly path: string;
  // exactOptionalPropertyTypes 下，可选属性默认不允许显式赋值成 undefined；
  // 调用方（例如 getJson）会用形如 { query } 的简写把「可能是 undefined 的参数」原样
  // 放进这个字段，所以这里显式把 undefined 也纳入类型，而不是硬要调用方改写成条件展开。
  readonly query?: QueryParams | undefined;
  readonly body?: unknown;
  readonly withToken: boolean;
}

/** 服务只在本机监听，握手和响应都很快；给个宽松但有限的超时，避免命令挂死。 */
const REQUEST_TIMEOUT_MS = 30_000;

export function createFleetClient(baseUrl: string, token: string): FleetClient {
  async function request<T>(spec: RequestSpec): Promise<T> {
    const url = buildUrl(baseUrl, spec.path, spec.query);
    const headers: Record<string, string> = {};
    if (spec.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (spec.withToken) {
      headers[TOKEN_HEADER] = token;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    // RequestInit.body 的类型不包含 undefined：没有请求体时整个键都不传，
    // 而不是传 body: undefined（exactOptionalPropertyTypes 下两者不等价）。
    const init: RequestInit = {
      method: spec.method,
      headers,
      signal: controller.signal,
      ...(spec.body !== undefined ? { body: JSON.stringify(spec.body) } : {}),
    };
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      throw new CliConnectionError(`连不上服务：${describeNetworkError(error)}`);
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    if (!response.ok) {
      throw await toResponseError(response.status, text);
    }
    return text.length === 0 ? parseJsonBody<T>("null") : parseJsonBody<T>(text);
  }

  return {
    getJson<T>(path: string, query?: QueryParams): Promise<T> {
      return request<T>({ method: "GET", path, query, withToken: false });
    },
    postJson<T>(path: string, body: unknown): Promise<T> {
      return request<T>({ method: "POST", path, body, withToken: true });
    },
    patchJson<T>(path: string, body: unknown): Promise<T> {
      return request<T>({ method: "PATCH", path, body, withToken: true });
    },
    postEmpty<T>(path: string): Promise<T> {
      return request<T>({ method: "POST", path, withToken: true });
    },
  };
}
