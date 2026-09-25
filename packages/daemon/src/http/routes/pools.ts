import {
  API_PATHS,
  poolEnabledRequestSchema,
  poolOrderRequestSchema,
  poolPatchSchema,
} from "@fleet/core";
import type { HttpApp, HttpAppDeps } from "../createApp.js";
import { parseOrThrow } from "../errors.js";
import { readJsonBody, requireCliOrDashboardToken, requireCliToken } from "../guards.js";

/**
 * GET /api/pools（不需要令牌）
 * PATCH /api/pools/:id（命令行令牌）
 * PUT /api/pools/:id/enabled、PUT /api/pools/order（命令行令牌或看板令牌）。
 *
 * 启停池和调顺序是看板仅有的两个写权限，所以单独挂 requireCliOrDashboardToken；
 * 改容量（PATCH）仍然只认命令行令牌。
 */
export function registerPoolsRoutes(
  app: HttpApp,
  { service, token, dashboardToken }: HttpAppDeps,
): void {
  app.get(API_PATHS.pools, (c) => c.json(service.pools()));

  // API_PATHS 里没有单独的“池路径模板”常量（只有按 id 编码的 URL 构造函数，给客户端拼具体地址用），
  // 这里在基础路径常量后面拼上 Hono 需要的 :id 占位符，仍然复用了 API_PATHS.pools 这个常量本身。
  // 直接写成字面量传给 app.put/app.patch，而不是先存到变量里，是为了让 Hono 能从字面量类型推出 :id 参数。

  // 必须注册在 /api/pools/:id 系列之前：否则 "order" 会被当成编号为 order 的池。
  app.put(
    `${API_PATHS.pools}/order`,
    requireCliOrDashboardToken(token, dashboardToken),
    async (c) => {
      const body = await readJsonBody(c);
      const request = parseOrThrow(poolOrderRequestSchema.safeParse(body));
      const pools = await service.reorderPools(request.poolIds);
      return c.json(pools);
    },
  );

  app.put(
    `${API_PATHS.pools}/:id/enabled`,
    requireCliOrDashboardToken(token, dashboardToken),
    async (c) => {
      const id = c.req.param("id");
      const body = await readJsonBody(c);
      const request = parseOrThrow(poolEnabledRequestSchema.safeParse(body));
      const pool = await service.setPoolEnabled(id, request.enabled);
      return c.json(pool);
    },
  );

  app.patch(`${API_PATHS.pools}/:id`, requireCliToken(token), async (c) => {
    const id = c.req.param("id");
    const body = await readJsonBody(c);
    const patch = parseOrThrow(poolPatchSchema.safeParse(body));
    const pool = await service.patchPool(id, patch);
    return c.json(pool);
  });
}
