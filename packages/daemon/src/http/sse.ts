import type { SSEStreamingApi } from "hono/streaming";

/** SSE 心跳间隔：不定期发点东西，连接可能被反向代理或浏览器当成空闲已断开。 */
export const SSE_HEARTBEAT_MS = 15_000;

/**
 * 定期写一行 SSE 注释（以冒号开头，EventSource 会直接忽略），充当心跳。
 * 返回值用于停止心跳，客户端断开时必须调用，否则定时器会一直占着。
 */
export function startHeartbeat(
  stream: SSEStreamingApi,
  intervalMs: number = SSE_HEARTBEAT_MS,
): () => void {
  const timer = setInterval(() => {
    void stream.write(": ping\n\n");
  }, intervalMs);
  return () => clearInterval(timer);
}

/**
 * 等到客户端断开（流被中止）才 resolve。
 * 配合 streamSSE 的回调使用：回调里 await 这个 Promise，让连接一直保持到断开为止。
 */
export function waitForAbort(stream: SSEStreamingApi): Promise<void> {
  return new Promise((resolve) => {
    if (stream.aborted) {
      resolve();
      return;
    }
    stream.onAbort(() => resolve());
  });
}

/** 发一条 JSON 格式的 SSE 具名事件。 */
export async function sendEvent<T>(stream: SSEStreamingApi, event: string, data: T): Promise<void> {
  await stream.writeSSE({ event, data: JSON.stringify(data) });
}

export interface Throttle {
  /** 触发一次：窗口内已经发送过就安排一次尾随发送；窗口已经过了就立刻发送。 */
  trigger(): void;
  /** 停止尚未触发的尾随发送（客户端断开时调用，避免定时器泄漏）。 */
  dispose(): void;
}

/**
 * 尾随节流：intervalMs 窗口内最多真正调用一次 send，且窗口内最后一次触发一定会被送出。
 * send 只在真正触发（立即或尾随定时器到点）那一刻执行，读到的是那一刻的最新数据，
 * 不是某次 trigger() 调用时刻的旧数据——这就是“不丢最后一次变化”的关键。
 */
export function createTrailingThrottle(intervalMs: number, send: () => void): Throttle {
  let lastSentAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush(): void {
    timer = null;
    lastSentAt = Date.now();
    send();
  }

  function trigger(): void {
    if (timer !== null) {
      // 已经安排了尾随发送，后面的重复触发不用再做什么，等它触发即可。
      return;
    }
    const elapsed = Date.now() - lastSentAt;
    if (elapsed >= intervalMs) {
      lastSentAt = Date.now();
      send();
      return;
    }
    timer = setTimeout(flush, intervalMs - elapsed);
  }

  function dispose(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return { trigger, dispose };
}
