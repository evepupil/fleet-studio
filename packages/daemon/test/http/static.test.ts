import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveStaticTarget } from "../../src/http/static.js";
import { startTestServer, type TestServer } from "./testServer.js";

function createWebDist(): string {
  const dir = mkdtempSync(join(tmpdir(), "fleet-http-static-"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>看板</title>");
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets", "app.js"), "console.log('app')");
  return dir;
}

describe("看板静态文件", () => {
  let server: TestServer;

  afterEach(async () => {
    await server.close();
  });

  it("命中 assets/ 下的文件：正确的 Content-Type，并加长期缓存", async () => {
    server = await startTestServer(createWebDist());

    const res = await fetch(`${server.baseUrl}/assets/app.js`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(await res.text()).toBe("console.log('app')");
  });

  it("直接请求 index.html：禁止缓存", async () => {
    server = await startTestServer(createWebDist());

    const res = await fetch(`${server.baseUrl}/index.html`);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("请求根路径：返回 index.html，禁止缓存", async () => {
    server = await startTestServer(createWebDist());

    const res = await fetch(`${server.baseUrl}/`);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toContain("看板");
  });

  it("没有命中任何文件时回退到 index.html（单页应用路由）", async () => {
    server = await startTestServer(createWebDist());

    const res = await fetch(`${server.baseUrl}/workers/w7k2mq`);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("看板");
  });

  it("Windows 带盘符的绝对路径会让 path.resolve 无视 root，这种解析后越界的情况一律 404", async () => {
    // fetch()/node:http 发出的请求，字面量或百分号编码的 .. 段都会在构造 WHATWG URL 时被
    // 当作路径归一化的一部分自动吃掉，走 HTTP 送不到一个真的带 .. 的路径给服务端；
    // 但带盘符的绝对路径（C:/...）不是点号段，能原样送达，且是 Windows 上真实存在的越界手法，
    // 用它来做端到端验证“解析后跑出目录之外一律 404”。
    server = await startTestServer(createWebDist());

    const res = await fetch(`${server.baseUrl}/C:/Windows/win.ini`);

    expect(res.status).toBe(404);
  });

  it("没有构建产物（index.html 不存在）时返回 200 的提示文字", async () => {
    server = await startTestServer(mkdtempSync(join(tmpdir(), "fleet-http-empty-")));

    const res = await fetch(`${server.baseUrl}/`);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("pnpm build");
  });
});

describe("resolveStaticTarget（纯函数，直接测路径越界判断）", () => {
  const root = resolve("C:\\fake\\dist");

  it("正常路径解析到 root 之下", () => {
    expect(resolveStaticTarget(root, "/assets/app.js")).toBe(resolve(root, "assets/app.js"));
  });

  it("根路径映射到 index.html", () => {
    expect(resolveStaticTarget(root, "/")).toBe(resolve(root, "index.html"));
  });

  it("路径里出现 .. 时判定越界，返回 null", () => {
    expect(resolveStaticTarget(root, "/assets/../../secret.txt")).toBeNull();
    expect(resolveStaticTarget(root, "/..")).toBeNull();
  });

  it("解析后跑出 root 之外时判定越界，返回 null（Windows 盘符绝对路径会让 resolve 无视 root）", () => {
    expect(resolveStaticTarget(root, "/C:/Windows/win.ini")).toBeNull();
  });
});
