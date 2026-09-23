import { pollUntil } from "./pollUntil.js";

export interface SseEvent {
  event: string;
  data: string;
}

/**
 * 测试用的最小 SSE 客户端：读原始字节、按空行切帧、挑出 event/data 行。
 * 断开连接必须靠外部传入的 AbortController（fetch 的 signal），
 * 单靠 cancel() reader 不保证服务端一定能感知到——这一点已经在 wait 接口的测试里验证过了。
 */
export class SseClient {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly controller: AbortController;
  private readonly decoder = new TextDecoder();
  private buffer = "";
  private events: SseEvent[] = [];
  private readonly pumpDone: Promise<void>;

  constructor(response: Response, controller: AbortController) {
    const body = response.body;
    if (body === null) {
      throw new Error("响应没有 body，不能当 SSE 读");
    }
    this.reader = body.getReader();
    this.controller = controller;
    this.pumpDone = this.pump();
  }

  private async pump(): Promise<void> {
    try {
      for (;;) {
        const { done, value } = await this.reader.read();
        if (done) {
          return;
        }
        this.buffer += this.decoder.decode(value, { stream: true });
        this.drain();
      }
    } catch {
      // 主动断开（AbortError）或连接被服务端关闭都会走到这里，测试不关心具体原因。
    }
  }

  private drain(): void {
    let boundary = this.buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawBlock = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      this.parseBlock(rawBlock);
      boundary = this.buffer.indexOf("\n\n");
    }
  }

  private parseBlock(rawBlock: string): void {
    let eventName = "message";
    const dataLines: string[] = [];
    for (const line of rawBlock.split("\n")) {
      if (line.startsWith(":")) {
        continue; // 心跳注释，不是事件。
      }
      if (line.startsWith("event:")) {
        eventName = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }
    if (dataLines.length > 0) {
      this.events.push({ event: eventName, data: dataLines.join("\n") });
    }
  }

  received(): readonly SseEvent[] {
    return this.events;
  }

  async waitForCount(count: number, timeoutMs = 2000): Promise<void> {
    await pollUntil(() => this.events.length >= count, timeoutMs);
  }

  /** 模拟客户端断开：中止发起请求时的 AbortController，服务端会感知到连接关闭。 */
  async disconnect(): Promise<void> {
    this.controller.abort();
    await this.pumpDone;
  }
}
