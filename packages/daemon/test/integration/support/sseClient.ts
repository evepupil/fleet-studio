/**
 * 读全局 SSE 流（GET /api/stream）收到的第一条事件，只为验证「连上立刻收到 snapshot」
 * 这一条行为，不需要一个完整的 SSE 客户端。用独立的 AbortController 管连接生命周期：
 * 读到第一帧就取消订阅，超时也靠它中止，不会让请求悬着。
 */
import type { Harness } from "./harness.js";

export interface SseEvent {
  event: string;
  data: string;
}

function parseBlock(rawBlock: string): SseEvent {
  let eventName = "message";
  const dataLines: string[] = [];
  for (const line of rawBlock.split("\n")) {
    if (line.startsWith(":")) {
      continue; // 心跳注释
    }
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }
  return { event: eventName, data: dataLines.join("\n") };
}

export async function readFirstSseEvent(
  harness: Harness,
  path: string,
  timeoutMs = 3000,
): Promise<SseEvent> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await harness.fetch(path, { signal: controller.signal });
    const body = response.body;
    if (body === null) {
      throw new Error("响应没有 body，不能当 SSE 读");
    }
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        throw new Error("SSE 连接在收到任何事件之前就关闭了");
      }
      buffer += decoder.decode(value, { stream: true });
      const boundary = buffer.indexOf("\n\n");
      if (boundary !== -1) {
        const event = parseBlock(buffer.slice(0, boundary));
        await reader.cancel();
        return event;
      }
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
