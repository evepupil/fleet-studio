import { API_PATHS, statsQuerySchema } from "@fleet/core";
import type { HttpApp, HttpAppDeps } from "../createApp.js";
import { parseFirstIssueOrThrow } from "../errors.js";

/**
 * GET /api/stats：总览统计，不需要令牌。
 * 查询参数组合规则多，校验失败只报第一条问题（看板一次只提示一条）。
 */
export function registerStatsRoutes(app: HttpApp, { service }: HttpAppDeps): void {
  app.get(API_PATHS.stats, (c) => {
    const query = parseFirstIssueOrThrow(statsQuerySchema.safeParse(c.req.query()));
    return c.json(service.stats(query));
  });
}
