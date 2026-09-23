import { type ServerType, serve } from "@hono/node-server";
import type { HttpApp } from "./createApp.js";

/** 只监听 127.0.0.1，防止服务被局域网内其他机器访问到。 */
const LOOPBACK_HOST = "127.0.0.1";

export interface HttpServerHandle {
  /** 实际监听的端口；传入 0 时由系统分配，这里回填真实值。 */
  port: number;
  close(): Promise<void>;
}

/** 启动 HTTP 服务；port 为 0 时用系统分配的端口。 */
export function startHttpServer(app: HttpApp, port: number): Promise<HttpServerHandle> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const server = serve({ fetch: app.fetch, port, hostname: LOOPBACK_HOST }, (info) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ port: info.port, close: () => closeServer(server) });
    });
    server.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    });
  });
}

function closeServer(server: ServerType): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}
