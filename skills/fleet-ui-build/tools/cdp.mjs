// 调试协议公共部分，shoot-cdp.mjs、shoot-states.mjs、probe.mjs 三个工具共用，和它们一起复制到 .fleet/。
// 负责：找本机 Edge、起无头实例并连上调试端口、发命令、自动发现导出目录里的页面、设备仿真、
// 以及注入到页面里的小工具（受控输入赋值、按文字找按钮、派发点击）。
//
// 为什么一律走调试协议：本机有其他浏览器实例在跑时，带 --screenshot 的一次性无头调用会静默退出、
// 退出码 0、不产出文件；无头窗口还有最小宽度，375 宽只能靠设备仿真。

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

export const ROOT = process.env.PROJECT_ROOT ?? process.cwd();
export const OUT = join(ROOT, process.env.EXPORT_DIR ?? "out");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const DEVICES = {
  mobile: { name: "mobile", width: 375, height: 812, deviceScaleFactor: 2, mobile: true },
  desktop: { name: "desktop", width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
};

export function findEdge() {
  const edge = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((p) => existsSync(p));
  if (!edge) throw new Error("找不到 Edge");
  return edge;
}

/** 导出目录里某个相对路径的 file:// 地址 */
export function fileUrl(relPath) {
  return `file:///${join(OUT, relPath).replaceAll("\\", "/")}`;
}

/**
 * 自动发现所有页面的本地副本（先跑 local-copy.mjs）。返回 [{ name, route, path }]，按路由排序，
 * 跳过 404 与 _not-found。name 取路由目录名，首页叫 home，多级路由用短横线连接。
 */
export function discoverPages() {
  const pages = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (entry === "_next" || entry === "404" || entry === "_not-found") continue;
        walk(p);
      } else if (entry === "index-local.html") {
        const relDir = relative(OUT, dirname(p)).split(sep).join("/");
        pages.push({
          name: relDir ? relDir.replaceAll("/", "-") : "home",
          route: relDir ? `/${relDir}/` : "/",
          path: relative(OUT, p).split(sep).join("/"),
        });
      }
    }
  };
  if (!existsSync(join(OUT, "index-local.html")))
    throw new Error("没有本地副本，先跑 node .fleet/local-copy.mjs");
  walk(OUT);
  return pages.sort((a, b) => a.route.localeCompare(b.route));
}

/** 注入页面的小工具。受控输入必须用原型上的 value setter 再派发 input / change 事件，直接改 value 框架感知不到 */
export const PRELUDE = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const txt = (el) => (el?.textContent ?? "").replace(/\\s+/g, " ").trim();
  const setVal = (el, v) => {
    if (!el) throw new Error("没找到要填的输入框");
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const clickEl = (el) => { if (!el) throw new Error("没找到要点的元素"); el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); };
  const byText = (sel, t, root = document) => $$(sel, root).find((e) => txt(e) === t) ?? $$(sel, root).find((e) => txt(e).startsWith(t));
`;

/**
 * 结束 Edge 整棵进程树。Edge 会拉起一串子进程（渲染、GPU、崩溃收集），只结束主进程会把它们
 * 留成孤儿、一直占着档案目录（2026-09-24 实测残留 9 个进程、446MB 档案挂了 5 个小时）。
 * 主进程句柄还在手里，进程号不会被复用，整棵结束是安全的。用同步调用：调用方不 await 也能收干净。
 */
function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
}

/**
 * 起一个无头 Edge 并连上调试端口。返回的对象：
 * - rpc(method, params)：发一条调试协议命令
 * - evaluate(body)：在页面里跑一段 async 脚本（已注入 PRELUDE），返回可序列化的结果
 * - setDevice(device)：设备仿真，传 DEVICES.mobile / DEVICES.desktop，或自定义 { width, height, ... }
 * - open(path, waitMs)：打开导出目录里的某个本地副本并等它渲染、挂上交互
 * - onEvent(fn)：订阅调试协议事件（异常、console 等）
 * - close()：断开并关掉浏览器
 */
export async function launch({ port, profile, hideScrollbars = true }) {
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${join(process.env.TEMP ?? "C:\\Temp", profile)}`,
    "about:blank",
  ];
  if (hideScrollbars) args.splice(4, 0, "--hide-scrollbars");
  const edge = spawn(findEdge(), args, { stdio: "ignore" });

  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl) ?? null;
    } catch {}
    if (!target) await sleep(250);
  }
  if (!target) {
    killTree(edge);
    throw new Error("调试端口没起来");
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  const listeners = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method) for (const fn of listeners) fn(msg);
  });

  let nextId = 1;
  const rpc = (method, params = {}) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const onMsg = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id !== id) return;
        ws.removeEventListener("message", onMsg);
        msg.error
          ? reject(new Error(`${method}: ${JSON.stringify(msg.error)}`))
          : resolve(msg.result);
      };
      ws.addEventListener("message", onMsg);
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  await rpc("Page.enable");
  await rpc("Runtime.enable");

  const evaluate = async (body) => {
    const r = await rpc("Runtime.evaluate", {
      expression: `(async () => { ${PRELUDE}\n${body} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)).slice(
          0,
          240,
        ),
      );
    return r.result.value;
  };

  const setDevice = (d) =>
    rpc("Emulation.setDeviceMetricsOverride", {
      width: d.width,
      height: d.height,
      deviceScaleFactor: d.deviceScaleFactor ?? 1,
      mobile: !!d.mobile,
      screenWidth: d.width,
      screenHeight: d.height,
    });

  const open = async (path, waitMs = 3200) => {
    await rpc("Page.navigate", { url: fileUrl(path) });
    await sleep(waitMs);
  };

  return {
    rpc,
    evaluate,
    setDevice,
    open,
    onEvent: (fn) => listeners.push(fn),
    close: () => {
      try {
        ws.close();
      } catch {}
      killTree(edge);
    },
  };
}
