import { API_PATHS, waitQuerySchema } from "@fleet/core";
import type { HttpApp, HttpAppDeps } from "../createApp.js";
import { parseOrThrow } from "../errors.js";

const SECONDS_TO_MS = 1000;

/**
 * GET /api/wait：挂起等待，不需要令牌。
 * 客户端断开时把 fetch 原生的中止信号（node-server 在连接断开时会触发它）传给 service.wait，
 * 让调度引擎知道不用再等这个请求了。
 */
export function registerWaitRoutes(app: HttpApp, { service }: HttpAppDeps): void {
  app.get(API_PATHS.wait, async (c) => {
    const query = parseOrThrow(waitQuerySchema.safeParse(c.req.query()));
    const result = await service.wait(
      query.ids,
      query.mode,
      query.timeoutSec * SECONDS_TO_MS,
      c.req.raw.signal,
    );
    return c.json(result);
  });
}
