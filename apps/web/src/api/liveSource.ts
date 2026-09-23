import type { Snapshot, TimelineEvent, WorkerDetail } from "@fleet/core";
import { API_PATHS, SSE_EVENTS } from "@fleet/core";
import type { ConnectionState, DataSource, WorkerHandlers } from "./dataSource";

/**
 * 真实数据源：全局快照走一条 SSE，单个苦工的详情先 fetch 一次再叠一条 SSE。
 * 两条流都用同一套退避重连节奏：断线后 1、2、4、8、10、10…秒重试，重连时不丢弃已经知道的数据。
 */

const RECONNECT_DELAYS_SEC: readonly number[] = [1, 2, 4, 8, 10];
const FALLBACK_DELAY_SEC = 10;

function reconnectDelayMs(attempt: number): number {
  const index = Math.min(attempt, RECONNECT_DELAYS_SEC.length - 1);
  const seconds = RECONNECT_DELAYS_SEC[index] ?? FALLBACK_DELAY_SEC;
  return seconds * 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** SSE 自定义事件名不在 EventSourceEventMap 里，浏览器类型只给得出 Event；用类型守卫收窄到 MessageEvent。 */
function isMessageEvent(event: Event): event is MessageEvent<unknown> {
  return "data" in event;
}

function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string") {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 最基本校验：是对象、关键字段类型对；不做深层字段校验，不合格直接丢弃这条消息。
 * 用解构而不是下标读字段：`noPropertyAccessFromIndexSignature` 不让点号访问索引签名类型，
 * 解构出来的本地变量就是普通标识符，两边（严格模式和 lint）都满意。
 */
function isSnapshot(value: unknown): value is Snapshot {
  if (!isRecord(value)) {
    return false;
  }
  const { version, serverTime, pools, projects, workers, roles } = value;
  return (
    typeof version === "string" &&
    typeof serverTime === "string" &&
    Array.isArray(pools) &&
    Array.isArray(projects) &&
    Array.isArray(workers) &&
    Array.isArray(roles)
  );
}

function isWorkerDetail(value: unknown): value is WorkerDetail {
  if (!isRecord(value)) {
    return false;
  }
  const { summary, projectPath, runs } = value;
  return isRecord(summary) && typeof projectPath === "string" && Array.isArray(runs);
}

function isTimelineEvent(value: unknown): value is TimelineEvent {
  if (!isRecord(value)) {
    return false;
  }
  const { kind, seq, runSeq, at } = value;
  return (
    typeof kind === "string" &&
    typeof seq === "number" &&
    typeof runSeq === "number" &&
    typeof at === "string"
  );
}

function extractTimelineEvents(value: unknown): TimelineEvent[] | null {
  if (!isRecord(value)) {
    return null;
  }
  const { events } = value;
  if (!Array.isArray(events)) {
    return null;
  }
  return events.filter(isTimelineEvent);
}

function subscribeSnapshot(
  onSnapshot: (snapshot: Snapshot) => void,
  onConnection: (state: ConnectionState) => void,
): () => void {
  let closed = false;
  let source: EventSource | null = null;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let connected = false;

  function handleDisconnect(): void {
    source?.close();
    source = null;
    if (connected) {
      connected = false;
      onConnection("lost");
    }
    if (closed) {
      return;
    }
    const delay = reconnectDelayMs(attempt);
    attempt += 1;
    retryTimer = setTimeout(connect, delay);
  }

  function connect(): void {
    if (closed) {
      return;
    }
    const nextSource = new EventSource(API_PATHS.stream);
    nextSource.addEventListener(SSE_EVENTS.snapshot, (event) => {
      if (!isMessageEvent(event)) {
        return;
      }
      const data = parseJson(event.data);
      if (!isSnapshot(data)) {
        return;
      }
      attempt = 0;
      if (!connected) {
        connected = true;
        onConnection("open");
      }
      onSnapshot(data);
    });
    nextSource.onerror = handleDisconnect;
    source = nextSource;
  }

  connect();

  return () => {
    closed = true;
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
    }
    source?.close();
  };
}

function subscribeWorker(id: string, after: number, handlers: WorkerHandlers): () => void {
  let closed = false;
  let source: EventSource | null = null;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let maxSeq = after;

  function openStream(): void {
    if (closed) {
      return;
    }
    const nextSource = new EventSource(`${API_PATHS.workerStream(id)}?after=${maxSeq}`);
    nextSource.addEventListener(SSE_EVENTS.worker, (event) => {
      if (!isMessageEvent(event)) {
        return;
      }
      const data = parseJson(event.data);
      if (!isWorkerDetail(data)) {
        return;
      }
      handlers.onDetail(data);
    });
    nextSource.addEventListener(SSE_EVENTS.timeline, (event) => {
      if (!isMessageEvent(event)) {
        return;
      }
      const events = extractTimelineEvents(parseJson(event.data));
      if (events === null || events.length === 0) {
        return;
      }
      for (const item of events) {
        if (item.seq > maxSeq) {
          maxSeq = item.seq;
        }
      }
      handlers.onEvents(events);
    });
    nextSource.onerror = () => {
      nextSource.close();
      source = null;
      if (closed) {
        return;
      }
      const delay = reconnectDelayMs(attempt);
      attempt += 1;
      retryTimer = setTimeout(openStream, delay);
    };
    source = nextSource;
  }

  async function start(): Promise<void> {
    let response: Response;
    try {
      response = await fetch(API_PATHS.worker(id));
    } catch {
      if (!closed) {
        handlers.onError("连接服务失败");
      }
      return;
    }
    if (closed) {
      return;
    }
    if (response.status === 404) {
      handlers.onNotFound();
      return;
    }
    if (!response.ok) {
      handlers.onError(`加载失败（状态码 ${response.status}）`);
      return;
    }
    const data = await response.json().catch(() => null);
    if (closed) {
      return;
    }
    if (!isWorkerDetail(data)) {
      handlers.onError("返回的数据格式不对");
      return;
    }
    handlers.onDetail(data);
    openStream();
  }

  start();

  return () => {
    closed = true;
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
    }
    source?.close();
  };
}

export function createLiveDataSource(): DataSource {
  return {
    subscribeSnapshot,
    subscribeWorker,
    fixedNow: () => null,
  };
}
