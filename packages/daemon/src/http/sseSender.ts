import type { SSEStreamingApi } from "hono/streaming";

export const SSE_MAX_PENDING_MESSAGES = 64;
export const SSE_MAX_PENDING_BYTES = 1024 * 1024;
export const SSE_WRITE_TIMEOUT_MS = 30_000;

interface PendingWrite {
  key: string | null;
  bytes: number;
  write(): Promise<unknown>;
  resolve(sent: boolean): void;
}

export interface SseSenderOptions {
  maxPendingMessages?: number;
  maxPendingBytes?: number;
  writeTimeoutMs?: number;
  onDisconnect?: (reason: string) => void;
}

export interface SseSender {
  send(event: string, data: unknown): Promise<boolean>;
  latest(event: string, read: () => unknown | null): void;
  heartbeat(): void;
  dispose(): void;
}

/** One write in flight; replaceable updates are read only when they can be sent. */
export function createSseSender(
  stream: SSEStreamingApi,
  options: SseSenderOptions = {},
): SseSender {
  const maxMessages = options.maxPendingMessages ?? SSE_MAX_PENDING_MESSAGES;
  const maxBytes = options.maxPendingBytes ?? SSE_MAX_PENDING_BYTES;
  const timeoutMs = options.writeTimeoutMs ?? SSE_WRITE_TIMEOUT_MS;
  const pending: PendingWrite[] = [];
  const latestByKey = new Map<string, PendingWrite>();
  let pendingBytes = 0;
  let current: PendingWrite | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function dispose(): void {
    if (closed) return;
    closed = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    current?.resolve(false);
    current = null;
    for (const message of pending) message.resolve(false);
    pending.length = 0;
    latestByKey.clear();
    pendingBytes = 0;
  }

  function disconnect(reason: string): void {
    if (closed) return;
    dispose();
    stream.abort();
    options.onDisconnect?.(reason);
  }

  async function write(message: PendingWrite): Promise<void> {
    try {
      await message.write();
      message.resolve(!closed && !stream.aborted);
    } catch {
      disconnect("实时连接发送失败，断开后等待客户端重连");
      message.resolve(false);
    } finally {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      current = null;
      pump();
    }
  }

  function pump(): void {
    if (closed || current !== null) return;
    const message = pending.shift();
    if (message === undefined) return;
    pendingBytes -= message.bytes;
    if (message.key !== null) latestByKey.delete(message.key);
    current = message;
    timer = setTimeout(() => {
      disconnect("实时连接发送等待超时，断开后等待客户端重连");
    }, timeoutMs);
    timer.unref();
    void write(message);
  }

  function enqueue(message: PendingWrite): void {
    if (closed || stream.aborted) {
      message.resolve(false);
      return;
    }
    // An awaited history page can be larger than the backlog budget: it is the
    // only write in flight. Additional messages must fit the bounded backlog.
    if (
      current !== null &&
      (pending.length >= maxMessages || pendingBytes + message.bytes > maxBytes)
    ) {
      disconnect("实时连接待发数据超过上限，断开后等待客户端重连");
      message.resolve(false);
      return;
    }
    pending.push(message);
    pendingBytes += message.bytes;
    if (message.key !== null) latestByKey.set(message.key, message);
    pump();
  }

  function replaceable(key: string, send: () => Promise<unknown>): void {
    if (closed || stream.aborted) return;
    const existing = latestByKey.get(key);
    if (existing !== undefined) {
      existing.write = send;
      return;
    }
    enqueue({ key, bytes: 0, write: send, resolve: () => {} });
  }

  stream.onAbort(dispose);
  if (stream.aborted) dispose();

  return {
    send(event, data): Promise<boolean> {
      if (closed || stream.aborted) return Promise.resolve(false);
      const serialized = JSON.stringify(data);
      return new Promise((resolve) => {
        enqueue({
          key: null,
          bytes: Buffer.byteLength(serialized, "utf8") + Buffer.byteLength(event, "utf8") + 32,
          write: () => stream.writeSSE({ event, data: serialized }),
          resolve,
        });
      });
    },
    latest(event, read): void {
      replaceable(event, async () => {
        const data = read();
        if (data !== null) await stream.writeSSE({ event, data: JSON.stringify(data) });
      });
    },
    heartbeat(): void {
      replaceable(": ping", () => stream.write(": ping\n\n"));
    },
    dispose,
  };
}
