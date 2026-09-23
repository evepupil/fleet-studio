import { API_PATHS, poolPatchSchema } from "@fleet/core";
import type { HttpApp, HttpAppDeps } from "../createApp.js";
import { parseOrThrow } from "../errors.js";
import { readJsonBody, tokenGuard } from "../guards.js";

/** GET /api/pools（不需要令牌）+ PATCH /api/pools/:id（需要令牌）。 */
export function registerPoolsRoutes(app: HttpApp, { service, token }: HttpAppDeps): void {
  app.get(API_PATHS.pools, (c) => c.json(service.pools()));

  // API_PATHS 里没有单独的“池路径模板”常量（只有按 id 编码的 URL 构造函数，给客户端拼具体地址用），
  // 这里在基础路径常量后面拼上 Hono 需要的 :id 占位符，仍然复用了 API_PATHS.pools 这个常量本身。
  // 直接写成字面量传给 app.patch，而不是先存到变量里，是为了让 Hono 能从字面量类型推出 :id 参数。
  app.patch(`${API_PATHS.pools}/:id`, tokenGuard(token), async (c) => {
    const id = c.req.param("id");
    const body = await readJsonBody(c);
    const patch = parseOrThrow(poolPatchSchema.safeParse(body));
    const pool = await service.patchPool(id, patch);
    return c.json(pool);
  });
}
