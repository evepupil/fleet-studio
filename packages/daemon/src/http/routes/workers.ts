import {
  API_PATHS,
  FleetError,
  listWorkersQuerySchema,
  SSE_EVENTS,
  sendRequestSchema,
  submitRequestSchema,
  type TimelineEvent,
  timelineQuerySchema,
} from "@fleet/core";
import { streamSSE } from "hono/streaming";
import type { HttpApp, HttpAppDeps } from "../createApp.js";
import { parseOrThrow } from "../errors.js";
import { readJsonBody, requireCliToken } from "../guards.js";
import { createTrailingThrottle, startHeartbeat, waitForAbort } from "../sse.js";
import { createSseSender } from "../sseSender.js";

/** 单苦工详情节流：距上次发送不到这个间隔就等到满足间隔再发最新详情。 */
const WORKER_DETAIL_THROTTLE_MS = 500;
/** 补历史时每批最多发这么多条时间线事件。 */
const TIMELINE_HISTORY_BATCH_SIZE = 500;

function notFound(): never {
  throw new FleetError("not_found", "苦工不存在");
}

export function registerWorkersRoutes(app: HttpApp, { service, token, logger }: HttpAppDeps): void {
  // API_PATHS.worker(id) 等函数是给客户端拼具体请求地址用的（内部会 encodeURIComponent），
  // 不能拿来当 Hono 路由模式；这里在 API_PATHS.workers 常量后面手写 :id 占位符对应的后缀。
  // 路径字面量直接写在每个 app.get/post 调用里（而不是先存进变量），
  // 这样 Hono 才能从字面量类型推出 :id 参数，c.req.param("id") 才能拿到非 undefined 的 string。

  app.get(API_PATHS.workers, (c) => {
    const query = parseOrThrow(listWorkersQuerySchema.safeParse(c.req.query()));
    return c.json(service.listWorkers(query));
  });

  app.post(API_PATHS.workers, requireCliToken(token), async (c) => {
    const body = await readJsonBody(c);
    const request = parseOrThrow(submitRequestSchema.safeParse(body));
    const worker = await service.submit(request);
    return c.json({ worker }, 201);
  });

  app.get(`${API_PATHS.workers}/:id`, (c) => {
    const detail = service.getWorker(c.req.param("id"));
    if (detail === null) {
      notFound();
    }
    return c.json(detail);
  });

  app.get(`${API_PATHS.workers}/:id/timeline`, async (c) => {
    const id = c.req.param("id");
    const query = parseOrThrow(timelineQuerySchema.safeParse(c.req.query()));
    const page = await service.timeline(id, query.after, query.limit);
    if (page === null) {
      notFound();
    }
    return c.json(page);
  });

  app.post(`${API_PATHS.workers}/:id/messages`, requireCliToken(token), async (c) => {
    const id = c.req.param("id");
    const body = await readJsonBody(c);
    const request = parseOrThrow(sendRequestSchema.safeParse(body));
    const worker = await service.send(id, request);
    return c.json({ worker });
  });

  app.post(`${API_PATHS.workers}/:id/cancel`, requireCliToken(token), async (c) => {
    const worker = await service.cancel(c.req.param("id"));
    return c.json({ worker });
  });

  app.get(`${API_PATHS.workers}/:id/stream`, (c) => {
    const id = c.req.param("id");
    const initialDetail = service.getWorker(id);
    if (initialDetail === null) {
      notFound();
    }
    const query = parseOrThrow(timelineQuerySchema.safeParse(c.req.query()));

    return streamSSE(c, async (stream) => {
      const sender = createSseSender(stream, { onDisconnect: (reason) => logger.warn(reason) });
      let lastQueuedSeq = query.after;
      let catchingUp = true;
      let timelineChanged = false;

      const sendTimelineBatch = (events: TimelineEvent[]): Promise<boolean> => {
        if (events.length === 0) return Promise.resolve(true);
        // 已排队的事件也参与去重，避免前一批尚未写完时重复入队。
        lastQueuedSeq = events.at(-1)?.seq ?? lastQueuedSeq;
        return sender.send(SSE_EVENTS.timeline, { events });
      };

      const detailThrottle = createTrailingThrottle(WORKER_DETAIL_THROTTLE_MS, () => {
        sender.latest(SSE_EVENTS.worker, () => service.getWorker(id));
      });
      const stopHeartbeat = startHeartbeat(sender);
      const unsubscribe = service.subscribe((event) => {
        if (event.type === "timeline" && event.workerId === id) {
          if (catchingUp) {
            timelineChanged = true;
          } else {
            const fresh = event.events.filter((item) => item.seq > lastQueuedSeq);
            void sendTimelineBatch(fresh);
          }
        } else if (event.type === "worker" && event.workerId === id) {
          detailThrottle.trigger();
        }
      });

      try {
        if (!(await sender.send(SSE_EVENTS.worker, initialDetail))) return;

        let cursor = query.after;
        for (;;) {
          timelineChanged = false;
          const page = await service.timeline(id, cursor, TIMELINE_HISTORY_BATCH_SIZE);
          if (stream.aborted || page === null) return;
          if (page.events.length > 0) {
            if (!(await sendTimelineBatch(page.events))) return;
            cursor = page.next;
          }
          if (page.events.length < TIMELINE_HISTORY_BATCH_SIZE && !timelineChanged) break;
        }
        catchingUp = false;
        await waitForAbort(stream);
      } finally {
        unsubscribe();
        detailThrottle.dispose();
        stopHeartbeat();
        sender.dispose();
      }
    });
  });
}
