import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

/** 桩服务记录下来的一次请求，测试用它断言路径、令牌、请求体对不对。 */
export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly query: URLSearchParams;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: string;
}

export interface StubResponseSpec {
  readonly status?: number;
  readonly body?: unknown;
}

// 允许返回 Promise：有些测试要模拟「服务端故意拖到很晚才回」（例如长轮询、超时场景），
// 得在 handler 里自己 await 一个延迟。
export type StubHandler = (
  request: RecordedRequest,
) => StubResponseSpec | Promise<StubResponseSpec>;

export interface StubServer {
  readonly baseUrl: string;
  readonly requests: readonly RecordedRequest[];
  close(): Promise<void>;
}

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value.join(",") : value;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * 起一个最小的 node:http 桩服务：不实现真实的闸门服务逻辑，只按测试给的 handler 回应，
 * 同时把每次请求记下来供断言。命令行只通过 HTTP 跟服务打交道，测试也就只需要伪造 HTTP 这一层。
 */
export async function startStubServer(handler: StubHandler): Promise<StubServer> {
  const requests: RecordedRequest[] = [];

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const bodyText = await readBody(req);
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const headers: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        headers[key] = normalizeHeaderValue(value);
      }
      const recorded: RecordedRequest = {
        method: req.method ?? "GET",
        path: url.pathname,
        query: url.searchParams,
        headers,
        body: bodyText,
      };
      requests.push(recorded);

      // handler 抛异常时也要给个响应：不然请求会一直挂着，等到客户端自己的超时才失败，
      // 排查起来会以为是别的问题（例如误以为服务连不上）。
      let spec: StubResponseSpec;
      try {
        spec = await handler(recorded);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        spec = { status: 500, body: { error: { code: "internal", message } } };
      }
      const status = spec.status ?? 200;
      const payload = spec.body !== undefined ? JSON.stringify(spec.body) : "";
      res.writeHead(status, { "content-type": "application/json" });
      res.end(payload);
    })();
  });

  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("桩服务没能拿到监听端口");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    requests,
    close(): Promise<void> {
      return new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
        // Node 的 fetch（undici）默认保持连接给下一次请求复用；测试跑完之后不会再有下一次
        // 请求，但那个 keep-alive 的 socket 还留着，server.close() 的回调就要等到它自然超时
        // 才触发，拖慢或挂住整个测试进程的收尾。主动把所有连接砸断，close() 立刻就能回调。
        server.closeAllConnections();
      });
    },
  };
}

/** 按方法和路径找出恰好一条记录到的请求；找不到就直接让测试失败，报错里带上实际收到的请求列表。 */
export function findRequest(
  requests: readonly RecordedRequest[],
  method: string,
  path: string,
): RecordedRequest {
  const found = requests.find((request) => request.method === method && request.path === path);
  if (found === undefined) {
    const seen = requests.map((request) => `${request.method} ${request.path}`).join(", ");
    throw new Error(`没有收到 ${method} ${path} 请求；实际收到：${seen || "（无）"}`);
  }
  return found;
}
