import type {
  PoolView,
  ProjectInfo,
  Snapshot,
  StatsQuery,
  StatsResponse,
  TaskPage,
  TasksQuery,
  TimelineEvent,
  WorkerDetail,
  WorkerSummary,
} from "@fleet/core";
import { API_PATHS, DASHBOARD_TOKEN_META, SSE_EVENTS, TOKEN_HEADER } from "@fleet/core";
import type { ConnectionState, DataSource, WorkerHandlers } from "./dataSource";

const RECONNECT_DELAYS_SEC: readonly number[] = [1, 2, 4, 8, 10];
const FALLBACK_DELAY_SEC = 10;

function reconnectDelayMs(attempt: number): number {
  const index = Math.min(attempt, RECONNECT_DELAYS_SEC.length - 1);
  return (RECONNECT_DELAYS_SEC[index] ?? FALLBACK_DELAY_SEC) * 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
  return Array.isArray(events) ? events.filter(isTimelineEvent) : null;
}

function isWorkerSummary(value: unknown): value is WorkerSummary {
  if (!isRecord(value)) {
    return false;
  }
  const { id, projectKey, title, status, runSeq, createdAt, usage } = value;
  return (
    typeof id === "string" &&
    typeof projectKey === "string" &&
    typeof title === "string" &&
    (status === "queued" ||
      status === "running" ||
      status === "completed" ||
      status === "failed" ||
      status === "cancelled") &&
    typeof runSeq === "number" &&
    typeof createdAt === "string" &&
    isRecord(usage)
  );
}

function isStatsResponse(value: unknown): value is StatsResponse {
  if (!isRecord(value)) {
    return false;
  }
  const {
    range,
    dimension,
    granularity,
    buckets,
    total,
    today,
    tokenShare,
    tasksByProject,
    tokenTrend,
  } = value;
  return (
    isRecord(range) &&
    (dimension === "model" ||
      dimension === "channel" ||
      dimension === "project" ||
      dimension === "role") &&
    (granularity === "hour" || granularity === "day" || granularity === "week") &&
    Array.isArray(buckets) &&
    isRecord(total) &&
    isRecord(today) &&
    Array.isArray(tokenShare) &&
    Array.isArray(tasksByProject) &&
    Array.isArray(tokenTrend)
  );
}

function isTaskPage(value: unknown): value is TaskPage {
  if (!isRecord(value)) {
    return false;
  }
  const { items, nextCursor, total } = value;
  return (
    Array.isArray(items) &&
    items.every(isWorkerSummary) &&
    (typeof nextCursor === "string" || nextCursor === null) &&
    typeof total === "number"
  );
}

function isProjects(value: unknown): value is ProjectInfo[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!isRecord(item)) {
        return false;
      }
      const { key, path, name, colorIndex } = item;
      return (
        typeof key === "string" &&
        typeof path === "string" &&
        typeof name === "string" &&
        typeof colorIndex === "number"
      );
    })
  );
}

function isPoolView(value: unknown): value is PoolView {
  if (!isRecord(value)) {
    return false;
  }
  const { id, enabled, capacity, slots } = value;
  return (
    typeof id === "string" &&
    typeof enabled === "boolean" &&
    typeof capacity === "number" &&
    Array.isArray(slots)
  );
}

function isPoolViews(value: unknown): value is PoolView[] {
  return Array.isArray(value) && value.every(isPoolView);
}

function appendQuery(path: string, query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized.length > 0 ? `${path}?${serialized}` : path;
}

async function requestError(response: Response): Promise<Error> {
  const fallback = `请求失败（状态码 ${response.status}）`;
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload)) {
      const { error } = payload;
      if (isRecord(error)) {
        const { message } = error;
        if (typeof message === "string") {
          return new Error(message);
        }
      }
    }
  } catch {
    return new Error(fallback);
  }
  return new Error(fallback);
}

async function requestJson<T>(
  url: string,
  guard: (value: unknown) => value is T,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw await requestError(response);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!guard(payload)) {
    throw new Error("返回的数据格式不对");
  }
  return payload;
}

function dashboardToken(): string | null {
  return (
    document.querySelector<HTMLMetaElement>(`meta[name="${DASHBOARD_TOKEN_META}"]`)?.content ?? null
  );
}

function subscribeSnapshot(
  onSnapshot: (snapshot: Snapshot) => void,
  onConnection: (connection: ConnectionState) => void,
): () => void {
  let closed = false;
  let source: EventSource | null = null;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let connected = false;

  function scheduleReconnect(failedSource: EventSource): void {
    if (closed || source !== failedSource) {
      return;
    }
    source = null;
    failedSource.close();
    connected = false;
    onConnection("lost");
    if (retryTimer !== null) {
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, reconnectDelayMs(attempt));
    attempt += 1;
  }

  function connect(): void {
    if (closed) {
      return;
    }
    onConnection("connecting");
    const nextSource = new EventSource(API_PATHS.stream);
    source = nextSource;
    nextSource.addEventListener(SSE_EVENTS.snapshot, (event) => {
      if (closed || source !== nextSource || !isMessageEvent(event)) {
        return;
      }
      const snapshot = parseJson(event.data);
      if (!isSnapshot(snapshot)) {
        return;
      }
      attempt = 0;
      if (!connected) {
        connected = true;
        onConnection("open");
      }
      onSnapshot(snapshot);
    });
    nextSource.onerror = () => scheduleReconnect(nextSource);
  }

  connect();
  return () => {
    closed = true;
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
    }
    source?.close();
    source = null;
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
    source = nextSource;
    nextSource.addEventListener(SSE_EVENTS.worker, (event) => {
      if (closed || source !== nextSource || !isMessageEvent(event)) {
        return;
      }
      const detail = parseJson(event.data);
      if (isWorkerDetail(detail)) {
        attempt = 0;
        handlers.onDetail(detail);
      }
    });
    nextSource.addEventListener(SSE_EVENTS.timeline, (event) => {
      if (closed || source !== nextSource || !isMessageEvent(event)) {
        return;
      }
      const events = extractTimelineEvents(parseJson(event.data));
      if (events === null || events.length === 0) {
        return;
      }
      for (const item of events) {
        maxSeq = Math.max(maxSeq, item.seq);
      }
      attempt = 0;
      handlers.onEvents(events);
    });
    nextSource.onerror = () => {
      if (closed || source !== nextSource) {
        return;
      }
      source = null;
      nextSource.close();
      if (retryTimer !== null) {
        return;
      }
      retryTimer = setTimeout(() => {
        retryTimer = null;
        openStream();
      }, reconnectDelayMs(attempt));
      attempt += 1;
    };
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
    const payload: unknown = await response.json().catch(() => null);
    if (closed) {
      return;
    }
    if (!isWorkerDetail(payload)) {
      handlers.onError("返回的数据格式不对");
      return;
    }
    handlers.onDetail(payload);
    openStream();
  }

  void start();
  return () => {
    closed = true;
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
    }
    source?.close();
  };
}

function setPoolEnabled(poolId: string, enabled: boolean): Promise<PoolView> {
  const token = dashboardToken();
  return requestJson(API_PATHS.poolEnabled(poolId), isPoolView, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(token === null ? {} : { [TOKEN_HEADER]: token }),
    },
    body: JSON.stringify({ enabled }),
  });
}

function reorderPools(poolIds: readonly string[]): Promise<PoolView[]> {
  const token = dashboardToken();
  return requestJson(API_PATHS.poolOrder, isPoolViews, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(token === null ? {} : { [TOKEN_HEADER]: token }),
    },
    body: JSON.stringify({ poolIds }),
  });
}

export function createLiveDataSource(): DataSource {
  return {
    subscribeSnapshot,
    subscribeWorker,
    fixedNow: () => null,
    getStats: (query: StatsQuery) =>
      requestJson(appendQuery(API_PATHS.stats, query), isStatsResponse),
    getTasks: (query: TasksQuery) => requestJson(appendQuery(API_PATHS.tasks, query), isTaskPage),
    getProjects: () => requestJson(API_PATHS.projects, isProjects),
    setPoolEnabled,
    reorderPools,
  };
}
