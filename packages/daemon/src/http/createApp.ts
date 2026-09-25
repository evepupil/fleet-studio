import { FleetError } from "@fleet/core";
import type { HttpBindings } from "@hono/node-server";
import { Hono } from "hono";
import type { Logger } from "../app/types.js";
import type { FleetService } from "../engine/service.js";
import { installErrorHandling, sendError } from "./errors.js";
import { hostGuard, originGuard } from "./guards.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerPoolsRoutes } from "./routes/pools.js";
import { registerProjectsRoutes } from "./routes/projects.js";
import { registerRolesRoutes } from "./routes/roles.js";
import { registerShutdownRoutes } from "./routes/shutdown.js";
import { registerSnapshotRoutes } from "./routes/snapshot.js";
import { registerStatsRoutes } from "./routes/stats.js";
import { registerTasksRoutes } from "./routes/tasks.js";
import { registerWaitRoutes } from "./routes/wait.js";
import { registerWorkersRoutes } from "./routes/workers.js";
import { createStaticHandler } from "./static.js";

/**
 * Hono 的环境类型：借 @hono/node-server 传进来的原生请求/响应对象。
 * 目前只有「响应发出后再退出服务」这一处用得到（监听 outgoing 的 finish 事件）。
 */
export type HttpEnv = { Bindings: HttpBindings };
export type HttpApp = Hono<HttpEnv>;

export interface HttpAppDeps {
  service: FleetService;
  /** 会改变状态的接口要校验的命令行令牌（写在 daemon.json 里）。 */
  token: string;
  /**
   * 看板令牌：只放在内存里，不写进 daemon.json。看板首页通过注入的 <meta> 拿到它，
   * 只能调启停池、调顺序两个 PUT 路由。
   */
  dashboardToken: string;
  /** 端口只有服务真正监听后才能确定（尤其是端口传 0 由系统分配时），用回调延迟读取。 */
  getPort: () => number;
  /** 看板静态文件构建产物所在目录，一般是 apps/web/dist。 */
  webDistDir: string;
  logger: Logger;
}

/**
 * 组装接口层：安全校验（主机名、来源）→ 各资源路由（内部按需再挂令牌与内容类型校验）
 * → 看板静态文件兜底 → 统一错误处理。
 */
export function createHttpApp(deps: HttpAppDeps): HttpApp {
  const app: HttpApp = new Hono();

  // 主机名、来源两道校验对全部路由生效，所以在最前面用全局中间件挂上。
  app.use("*", hostGuard(deps.getPort));
  app.use("*", originGuard(deps.getPort));

  registerHealthRoutes(app, deps);
  registerSnapshotRoutes(app, deps);
  registerWorkersRoutes(app, deps);
  registerWaitRoutes(app, deps);
  registerPoolsRoutes(app, deps);
  registerRolesRoutes(app, deps);
  registerStatsRoutes(app, deps);
  registerTasksRoutes(app, deps);
  registerProjectsRoutes(app, deps);
  registerShutdownRoutes(app, deps);

  // 走到这里说明前面所有具体的 /api/... 路由都没匹配上：按规格统一 404。
  // 必须注册在具体路由之后、静态文件兜底之前，否则会被下面的通配 GET 抢先处理。
  app.all("/api/*", (c) => sendError(c, new FleetError("not_found", "接口不存在")));

  app.get("*", createStaticHandler(deps.webDistDir, deps.dashboardToken));

  installErrorHandling(app, deps.logger);

  return app;
}
