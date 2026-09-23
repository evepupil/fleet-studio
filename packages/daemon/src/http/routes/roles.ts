import { API_PATHS } from "@fleet/core";
import type { HttpApp, HttpAppDeps } from "../createApp.js";

/** GET /api/roles：角色列表，不需要令牌。 */
export function registerRolesRoutes(app: HttpApp, { service }: HttpAppDeps): void {
  app.get(API_PATHS.roles, (c) => c.json(service.roles()));
}
