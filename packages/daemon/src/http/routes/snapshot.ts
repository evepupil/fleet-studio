import { API_PATHS, SSE_EVENTS } from "@fleet/core";
import { streamSSE } from "hono/streaming";
import type { HttpApp, HttpAppDeps } from "../createApp.js";
import { createTrailingThrottle, startHeartbeat, waitForAbort } from "../sse.js";
import { createSseSender } from "../sseSender.js";

/** 距上次发送不到这个间隔就等到满足间隔再发，尾随发送，不丢最后一次变化。 */
const SNAPSHOT_THROTTLE_MS = 300;

/** GET /api/snapshot + GET /api/stream（全局 SSE）：都不需要令牌，看板本身只读。 */
export function registerSnapshotRoutes(app: HttpApp, { service, logger }: HttpAppDeps): void {
  app.get(API_PATHS.snapshot, (c) => c.json(service.snapshot()));

  app.get(API_PATHS.stream, (c) =>
    streamSSE(c, async (stream) => {
      const sender = createSseSender(stream, { onDisconnect: (reason) => logger.warn(reason) });
      try {
        if (!(await sender.send(SSE_EVENTS.snapshot, service.snapshot()))) return;

        const throttle = createTrailingThrottle(SNAPSHOT_THROTTLE_MS, () => {
          sender.latest(SSE_EVENTS.snapshot, () => service.snapshot());
        });
        const stopHeartbeat = startHeartbeat(sender);
        const unsubscribe = service.subscribe((event) => {
          if (event.type === "snapshot") throttle.trigger();
        });

        try {
          await waitForAbort(stream);
        } finally {
          unsubscribe();
          throttle.dispose();
          stopHeartbeat();
        }
      } finally {
        sender.dispose();
      }
    }),
  );
}
