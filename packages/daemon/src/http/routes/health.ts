import { API_PATHS } from "@fleet/core";
import type { HttpApp, HttpAppDeps } from "../createApp.js";

/** GET /api/health：服务存活探测，不需要令牌。 */
export function registerHealthRoutes(app: HttpApp, { service }: HttpAppDeps): void {
  app.get(API_PATHS.health, (c) => c.json(service.health()));
}
