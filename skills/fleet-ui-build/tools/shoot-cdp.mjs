// 验收工具：逐页、逐设备做调试协议仿真截图，并实测横向溢出。
// 用法：先跑 local-copy.mjs，再 node .fleet/shoot-cdp.mjs [tag] [页面名，可选，如 course]
// 页面自动从导出目录的本地副本里发现；输出到 .fleet/shots/<tag>-<页面>-<设备>-first.png / -partN.png / -full.png。
//
// 长页面整页截图超过约 16384 像素会失败，所以一律「首屏一张 + 按段切片」，
// 页面总高不超过 15000 时再额外存一张整页图。截整页前先把视口撑到整页高度，让延迟加载的图片进过视口。
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEVICES, discoverPages, launch, ROOT, sleep } from "./cdp.mjs";

const SHOTS = join(ROOT, ".fleet", "shots");
const TAG = process.argv[2] ?? "cdp";
const ONLY = process.argv[3] ?? null;
const SEGMENT = { mobile: 3200, desktop: 2800 };
mkdirSync(SHOTS, { recursive: true });

// 页面实际宽度 + 越界元素。处在横向滚动或裁剪容器里的元素不算溢出；scrollWidth === clientWidth 才是真判据。
// 手机上溢出，第一个怀疑网格子项缺 min-w-0。
const OVERFLOW_PROBE = `
  const cw = document.documentElement.clientWidth;
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > cw + 1) {
      let clipped = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (["auto", "scroll", "hidden"].includes(s.overflowX)) { clipped = true; break; }
      }
      if (!clipped) out.push({ tag: el.tagName.toLowerCase(), cls: (typeof el.className === "string" ? el.className : "").slice(0, 70), right: Math.round(r.right), width: Math.round(r.width) });
    }
  }
  out.sort((a, b) => b.right - a.right);
  return { cw, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, over: out.slice(0, 10) };
`;

const pages = discoverPages().filter((p) => ONLY === null || p.name === ONLY);
const b = await launch({ port: Number(process.env.CDP_PORT ?? 9333), profile: "edge-cdp-shoot" });
let overflowPages = 0;
try {
  for (const page of pages) {
    for (const dev of [DEVICES.mobile, DEVICES.desktop]) {
      await b.setDevice(dev);
      await b.open(page.path, 3500);
      const probe = await b.evaluate(OVERFLOW_PROBE);
      const overflow = probe.sw > probe.cw;
      if (overflow) overflowPages++;
      console.log(`\n## ${page.name} · ${dev.name} ${dev.width}x${dev.height}`);
      console.log(
        `clientWidth=${probe.cw} scrollWidth=${probe.sw} scrollHeight=${probe.sh} ${overflow ? "<<< 横向溢出" : "无横向溢出"}`,
      );
      for (const o of probe.over)
        console.log(`  越界: <${o.tag}> right=${o.right} width=${o.width} ${o.cls}`);

      const prefix = join(SHOTS, `${TAG}-${page.name}-${dev.name}`);
      const first = await b.rpc("Page.captureScreenshot", { format: "png" });
      writeFileSync(`${prefix}-first.png`, Buffer.from(first.data, "base64"));

      await b.setDevice({ ...dev, height: probe.sh, deviceScaleFactor: 1 });
      await sleep(2500);
      let part = 0;
      for (let y = 0; y < probe.sh; y += SEGMENT[dev.name]) {
        part++;
        const h = Math.min(SEGMENT[dev.name], probe.sh - y);
        const shot = await b.rpc("Page.captureScreenshot", {
          format: "png",
          clip: { x: 0, y, width: dev.width, height: h, scale: 1 },
          captureBeyondViewport: true,
        });
        writeFileSync(`${prefix}-part${part}.png`, Buffer.from(shot.data, "base64"));
      }
      if (probe.sh <= 15000) {
        const full = await b.rpc("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
        });
        writeFileSync(`${prefix}-full.png`, Buffer.from(full.data, "base64"));
      }
      console.log(`  saved ${prefix}-first.png + ${part} 段${probe.sh <= 15000 ? " + full" : ""}`);
    }
  }
  console.log(`\n共 ${pages.length} 页，横向溢出 ${overflowPages} 处（页面 × 设备）`);
  if (overflowPages > 0) process.exitCode = 1;
} catch (e) {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  b.close();
}
