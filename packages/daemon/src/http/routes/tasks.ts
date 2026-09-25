import { API_PATHS, tasksQuerySchema } from "@fleet/core";
import type { HttpApp, HttpAppDeps } from "../createApp.js";
import { parseOrThrow } from "../errors.js";

/** GET /api/tasks：任务列表的一页，不需要令牌。 */
export function registerTasksRoutes(app: HttpApp, { service }: HttpAppDeps): void {
  app.get(API_PATHS.tasks, (c) => {
    const query = parseOrThrow(tasksQuerySchema.safeParse(c.req.query()));
    return c.json(service.tasks(query));
  });
}
