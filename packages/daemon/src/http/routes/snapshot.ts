import { API_PATHS, type Snapshot, SSE_EVENTS } from "@fleet/core";
import { streamSSE } from "hono/streaming";
import type { HttpApp, HttpAppDeps } from "../createApp.js";
import { createTrailingThrottle, sendEvent, startHeartbeat, waitForAbort } from "../sse.js";

/** 距上次发送不到这个间隔就等到满足间隔再发，尾随发送，不丢最后一次变化。 */
const SNAPSHOT_THROTTLE_MS = 300;

/** GET /api/snapshot + GET /api/stream（全局 SSE）：都不需要令牌，看板本身只读。 */
export function registerSnapshotRoutes(app: HttpApp, { service }: HttpAppDeps): void {
  app.get(API_PATHS.snapshot, (c) => c.json(service.snapshot()));

  app.get(API_PATHS.stream, (c) =>
    streamSSE(c, async (stream) => {
      // 连上立刻发一条完整快照。
      await sendEvent<Snapshot>(stream, SSE_EVENTS.snapshot, service.snapshot());

      const throttle = createTrailingThrottle(SNAPSHOT_THROTTLE_MS, () => {
        void sendEvent<Snapshot>(stream, SSE_EVENTS.snapshot, service.snapshot());
      });
      const stopHeartbeat = startHeartbeat(stream);
      const unsubscribe = service.subscribe((event) => {
        if (event.type === "snapshot") {
          throttle.trigger();
        }
      });

      await waitForAbort(stream);
      unsubscribe();
      throttle.dispose();
      stopHeartbeat();
    }),
  );
}
