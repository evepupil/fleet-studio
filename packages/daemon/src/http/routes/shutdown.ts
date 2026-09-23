import { API_PATHS } from "@fleet/core";
import type { HttpApp, HttpAppDeps } from "../createApp.js";
import { tokenGuard } from "../guards.js";

/**
 * POST /api/shutdown：先把响应发出去，等响应真正写完（Node 原生响应的 finish 事件）
 * 再让服务退出，避免调用方连响应都还没收到，进程就已经没了。
 */
export function registerShutdownRoutes(app: HttpApp, { service, token }: HttpAppDeps): void {
  app.post(API_PATHS.shutdown, tokenGuard(token), (c) => {
    c.env.outgoing.once("finish", () => service.requestShutdown());
    return c.json({ ok: true });
  });
}
