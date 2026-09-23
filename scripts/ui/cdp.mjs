// 看板验收用的最小调试协议客户端：启动无头 Edge，打开构建产物，截图、执行脚本。
// 不起任何服务器：构建产物用相对路径引用资源，配合 --allow-file-access-from-files 直接用 file:// 打开。
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const EDGE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 构建产物首页的 file:// 地址，可带查询参数和锚点 */
export function distUrl(root, search = "", hash = "") {
  const index = join(root, "apps", "web", "dist", "index.html");
  if (!existsSync(index)) {
    throw new Error(`${index} 不存在，先运行 pnpm --filter @fleet/web build`);
  }
  return `${pathToFileURL(index).href}${search}${hash}`;
}

async function fetchJson(url, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // 浏览器还没起来，继续等
    }
    await sleep(250);
  }
  throw new Error(`连不上调试端口：${url}`);
}

/** 启动一个无头 Edge 并连上它的第一个页面 */
export async function launchBrowser(port) {
  const edge = EDGE_CANDIDATES.find((path) => existsSync(path));
  if (!edge) throw new Error("找不到 Edge");
  const profile = mkdtempSync(join(tmpdir(), "fleet-ui-cdp-"));
  const child = spawn(
    edge,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--allow-file-access-from-files",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("没有找到页面目标");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  const rpc = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  await rpc("Page.enable");
  await rpc("Runtime.enable");
  // 无头页面默认没有获得焦点，脚本里调用 focus() 只改 activeElement、不触发聚焦事件，
  // 键盘聚焦类的交互（例如聚焦格子弹出提示卡）会因此测不出来。打开焦点模拟后行为与真实窗口一致。
  await rpc("Emulation.setFocusEmulationEnabled", { enabled: true });

  return {
    rpc,
    async setViewport(width, height) {
      await rpc("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
    },
    async setTheme(theme, reducedMotion = "no-preference") {
      // 本机系统设置会让浏览器报告「减少动效」，截图时默认显式模拟不减少，才能看到常规画法
      await rpc("Emulation.setEmulatedMedia", {
        features: [
          { name: "prefers-color-scheme", value: theme },
          { name: "prefers-reduced-motion", value: reducedMotion },
        ],
      });
    },
    async open(url, waitMs = 1200) {
      await rpc("Page.navigate", { url });
      await sleep(waitMs);
    },
    async evaluate(expression) {
      const result = await rpc("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(
          result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
        );
      }
      return result.result.value;
    },
    async screenshot() {
      const shot = await rpc("Page.captureScreenshot", { format: "png" });
      return Buffer.from(shot.data, "base64");
    },
    async close() {
      socket.close();
      child.kill();
      await sleep(300);
      // 浏览器子进程退出后可能还短暂占着临时配置目录里的文件，删不掉就留给系统清理，不让验收报错
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
      } catch {
        // 忽略：只是临时目录
      }
    },
  };
}
