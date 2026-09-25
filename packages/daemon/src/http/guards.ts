import { timingSafeEqual } from "node:crypto";
import { FleetError, TOKEN_HEADER } from "@fleet/core";
import type { Context, MiddlewareHandler } from "hono";

/** 请求体上限：1 MiB，超过一律 400。 */
export const MAX_JSON_BODY_BYTES = 1024 * 1024;

function readHeader(c: Context, name: string): string {
  return (c.req.header(name) ?? "").trim().toLowerCase();
}

/**
 * 主机名校验（第一道）：Host 必须是 127.0.0.1:<端口> 或 localhost:<端口>，防 DNS 重绑定。
 * 端口要等服务真正监听后才确定（尤其是传 0 由系统分配时），所以用回调延迟读取，
 * 而不是在创建 app 时就把端口固定下来。
 */
export function hostGuard(getPort: () => number): MiddlewareHandler {
  return async (c, next) => {
    const host = readHeader(c, "host");
    const port = getPort();
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      throw new FleetError("forbidden_origin", "请求的 Host 不是本机服务地址");
    }
    await next();
  };
}

/**
 * 来源校验（第二道）：带 Origin 头时必须是看板自身的地址，防网页跨站调用。
 * 命令行等非浏览器客户端不会带 Origin，没带就直接放行。
 */
export function originGuard(getPort: () => number): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header("origin");
    if (origin !== undefined) {
      const port = getPort();
      const normalized = origin.trim().toLowerCase();
      if (normalized !== `http://127.0.0.1:${port}` && normalized !== `http://localhost:${port}`) {
        throw new FleetError("forbidden_origin", "请求的来源不是本机看板");
      }
    }
    await next();
  };
}

/**
 * 定长比较：长度不同直接判不等，不调用 timingSafeEqual（长度不同它会直接抛异常），
 * 避免因为“提前抛异常”本身泄露长度信息，也避免真的抛出未处理异常。
 */
function tokensMatch(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (providedBytes.length !== expectedBytes.length) {
    return false;
  }
  return timingSafeEqual(providedBytes, expectedBytes);
}

/** 令牌校验（第三道）：只认命令行令牌，挂在会改变状态的路由上。 */
export function requireCliToken(token: string): MiddlewareHandler {
  return async (c, next) => {
    const provided = c.req.header(TOKEN_HEADER);
    if (provided === undefined || !tokensMatch(provided, token)) {
      throw new FleetError("unauthorized", "缺少或者不正确的本机令牌");
    }
    await next();
  };
}

/**
 * 令牌校验（第三道）：命令行令牌或看板令牌任一匹配即可。
 * 只挂在启停池、调顺序两个 PUT 路由上；看板令牌不能派活、续接、取消、改容量、关服务，
 * 那些路由仍然用 requireCliToken。两个令牌都用定长比较，比较顺序不影响安全。
 */
export function requireCliOrDashboardToken(
  cliToken: string,
  dashboardToken: string,
): MiddlewareHandler {
  return async (c, next) => {
    const provided = c.req.header(TOKEN_HEADER);
    if (
      provided === undefined ||
      (!tokensMatch(provided, cliToken) && !tokensMatch(provided, dashboardToken))
    ) {
      throw new FleetError("unauthorized", "缺少或者不正确的本机令牌");
    }
    await next();
  };
}

/**
 * 内容类型与大小校验（第四道）：带请求体的 POST / PUT / PATCH 必须是 application/json，
 * 且不超过 maxBytes；返回解析后的原始 JSON（还没做业务字段校验，交给调用方用 zod 模式处理）。
 *
 * Content-Length 头只做“提前拦截明显超限”的优化；真正生效的判断是读到内容后按实际字节数核对，
 * 防止客户端谎报或者用分块编码绕过 Content-Length。
 */
export async function readJsonBody(
  c: Context,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  const contentType = (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new FleetError("invalid_request", "请求内容类型必须是 application/json");
  }

  const declaredLength = Number(c.req.header("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new FleetError("invalid_request", "请求体超过 1MB 上限");
  }

  const text = await c.req.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new FleetError("invalid_request", "请求体超过 1MB 上限");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new FleetError("invalid_request", "请求体不是合法的 JSON");
  }
}
