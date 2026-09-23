import { mkdtempSync } from "node:fs";
import { request as httpRequest, type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Logger } from "../../src/app/types.js";
import { createHttpApp } from "../../src/http/createApp.js";
import { type HttpServerHandle, startHttpServer } from "../../src/http/startServer.js";
import { createFakeService, type FakeService } from "./fakeService.js";

/** 固定测试令牌，长度和真实令牌接近，够用来测定长比较。 */
export const TEST_TOKEN = "fleet-test-token-0123456789abcdef";

/**
 * 解析响应体用于断言。这个项目没有引入 DOM 类型库，fetch() 的 res.json() 被 @types/node
 * 推断成 Promise<unknown>，逐层取字段（例如 body.error.code）会被类型检查拦下来；
 * 这里借 JSON.parse 本身的隐式返回类型拿到可以随便取字段的值，断言错了照样会在运行时被
 * vitest 的 expect 抓到，不影响测试的有效性。
 */
export async function readJsonBody(res: Response) {
  return JSON.parse(await res.text());
}

function createSilentLogger(): Logger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

export interface RawRequestOptions {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface TestServer {
  baseUrl: string;
  port: number;
  token: string;
  service: FakeService;
  webDistDir: string;
  /** 带令牌头发请求的简便封装，改动类接口测试基本都用它。 */
  fetchWithToken(path: string, init?: RequestInit): Promise<Response>;
  /**
   * 用 node:http 直接发请求：唯一目的是测错误的 Host 头——fetch() 会按 URL 自动改写 Host，
   * 没法伪造成别的值，只有 node:http 的 request 能自己指定原始请求头。
   */
  rawRequest(options: RawRequestOptions): Promise<RawResponse>;
  close(): Promise<void>;
}

/** 起一个真实监听 127.0.0.1 的接口层服务，供集成测试直接发请求。 */
export async function startTestServer(webDistDir?: string): Promise<TestServer> {
  const service = createFakeService();
  const token = TEST_TOKEN;
  const resolvedWebDistDir = webDistDir ?? mkdtempSync(join(tmpdir(), "fleet-http-test-"));
  // port 要等 startHttpServer resolve 之后才知道；getPort 用闭包延迟读取，
  // 和生产代码里“端口传 0 由系统分配”的场景完全一致。
  let port = 0;

  const app = createHttpApp({
    service,
    token,
    getPort: () => port,
    webDistDir: resolvedWebDistDir,
    logger: createSilentLogger(),
  });

  const handle: HttpServerHandle = await startHttpServer(app, 0);
  port = handle.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    port,
    token,
    service,
    webDistDir: resolvedWebDistDir,
    fetchWithToken: (path, init = {}) =>
      fetch(`${baseUrl}${path}`, {
        ...init,
        headers: { ...init.headers, "x-fleet-token": token },
      }),
    rawRequest: (options) => sendRawRequest(port, options),
    close: () => handle.close(),
  };
}

function sendRawRequest(port: number, options: RawRequestOptions): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method: options.method ?? "GET",
        path: options.path,
        headers: options.headers,
      },
      (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    if (options.body !== undefined) {
      req.write(options.body);
    }
    req.end();
  });
}
