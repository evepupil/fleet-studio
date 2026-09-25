import { type ErrorCode, FleetError, isFleetError } from "@fleet/core";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Logger } from "../app/types.js";
import type { HttpApp } from "./createApp.js";

/**
 * 错误码 → HTTP 状态码的映射（规格 3.4）。
 * 用 Record 而不是 switch，是为了让 TypeScript 在漏写某个错误码时直接报编译错误。
 */
const STATUS_BY_CODE: Record<ErrorCode, ContentfulStatusCode> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden_origin: 403,
  not_found: 404,
  conflict: 409,
  illegal_transition: 409,
  pool_disabled: 409,
  runtime_unavailable: 422,
  config_invalid: 500,
  internal: 500,
};

export function statusForErrorCode(code: ErrorCode): ContentfulStatusCode {
  return STATUS_BY_CODE[code];
}

/**
 * zod 校验失败信息里用得到的最小结构。
 * 只声明用到的字段，不直接依赖 zod 包（daemon 只用 @fleet/core 导出的现成模式，不装 zod）。
 */
export interface ValidationIssueLike {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/** 按规格拼成「请求参数不对：<字段>：<原因>；…」。字段路径为空时（例如整体 refine）用「请求体」占位。 */
export function toValidationError(issues: readonly ValidationIssueLike[]): FleetError {
  const detail = issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "请求体"}：${issue.message}`)
    .join("；");
  return new FleetError("invalid_request", `请求参数不对：${detail}`);
}

/**
 * 从 zod 的 safeParse 结果里取出数据；失败时抛格式化好的 FleetError。
 * 参数类型按结构声明（而不是引入 zod 的 SafeParseReturnType），调用处直接传 `schema.safeParse(input)` 即可。
 */
export function parseOrThrow<T>(
  result:
    | { readonly success: true; readonly data: T }
    | {
        readonly success: false;
        readonly error: { readonly issues: readonly ValidationIssueLike[] };
      },
): T {
  if (!result.success) {
    throw toValidationError(result.error.issues);
  }
  return result.data;
}

/**
 * 和 parseOrThrow 一样，但只报第一条问题。统计接口的查询参数可能同时命中多条规则，
 * 看板只需要展示一条，避免把一串问题都糊在界面上。
 */
export function parseFirstIssueOrThrow<T>(
  result:
    | { readonly success: true; readonly data: T }
    | {
        readonly success: false;
        readonly error: { readonly issues: readonly ValidationIssueLike[] };
      },
): T {
  if (!result.success) {
    throw toValidationError(result.error.issues.slice(0, 1));
  }
  return result.data;
}

/** 统一的错误响应体：{ error: { code, message } }。 */
export function sendError(c: Context, error: FleetError): Response {
  return c.json(
    { error: { code: error.code, message: error.message } },
    statusForErrorCode(error.code),
  );
}

/**
 * 注册全局错误处理：FleetError 按错误码转状态码；其余异常一律 500，
 * 详细堆栈只写日志，绝不回给客户端（避免泄露内部信息）。
 */
export function installErrorHandling(app: HttpApp, logger: Logger): void {
  app.onError((error, c) => {
    if (isFleetError(error)) {
      return sendError(c, error);
    }
    logger.error("接口处理时发生未预期的错误", error);
    return c.json({ error: { code: "internal", message: "服务内部错误" } }, 500);
  });
}
