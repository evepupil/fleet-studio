import { API_PATHS } from "@fleet/core";
import type { HttpApp, HttpAppDeps } from "../createApp.js";

/** GET /api/projects：全部项目（任务页的项目筛选用），不需要令牌。 */
export function registerProjectsRoutes(app: HttpApp, { service }: HttpAppDeps): void {
  app.get(API_PATHS.projects, (c) => c.json(service.projects()));
}
