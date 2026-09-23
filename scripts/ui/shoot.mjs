// 看板截图验收：演示数据的各场景 × 几档宽度 × 深浅主题，截图并实测横向溢出。
// 用法：pnpm --filter @fleet/web build 之后运行 node scripts/ui/shoot.mjs [标签]
// 截图写到 .fleet/shots/<标签>/，横向溢出时退出码为 1。
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { distUrl, launchBrowser } from "./cdp.mjs";

const ROOT = process.cwd();
const TAG = process.argv[2] ?? "latest";
const OUT = join(ROOT, ".fleet", "shots", TAG);
mkdirSync(OUT, { recursive: true });

const WIDTHS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1024", width: 1024, height: 768 },
  { name: "800", width: 800, height: 900 },
];

/** 每一项：场景、选中的苦工、要拍的宽度、要拍的主题 */
const CASES = [
  {
    name: "busy-review",
    search: "?demo=busy",
    hash: "#/w/wr8v2k",
    widths: ["1440", "1280", "1024", "800"],
    themes: ["dark", "light"],
  },
  {
    name: "busy-running",
    search: "?demo=busy",
    hash: "#/w/wk3m7p",
    widths: ["1440"],
    themes: ["dark", "light"],
  },
  {
    name: "busy-retrying",
    search: "?demo=busy",
    hash: "#/w/wx2j3k",
    widths: ["1440"],
    themes: ["dark"],
  },
  {
    name: "busy-failed",
    search: "?demo=busy",
    hash: "#/w/wu3y6z",
    widths: ["1440"],
    themes: ["dark"],
  },
  { name: "busy-none", search: "?demo=busy", hash: "", widths: ["1440", "800"], themes: ["dark"] },
  { name: "empty", search: "?demo=empty", hash: "", widths: ["1440"], themes: ["dark", "light"] },
  { name: "failure", search: "?demo=failure", hash: "", widths: ["1440"], themes: ["dark"] },
  {
    name: "offline",
    search: "?demo=offline",
    hash: "#/w/wr8v2k",
    widths: ["1440"],
    themes: ["dark"],
  },
];

const OVERFLOW_PROBE = `(() => {
  const cw = document.documentElement.clientWidth;
  const sw = document.documentElement.scrollWidth;
  const over = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.right > cw + 1 && r.width > 0) {
      over.push((el.tagName.toLowerCase()) + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : "") + " right=" + Math.round(r.right));
    }
  }
  return { cw, sw, over: over.slice(0, 8) };
})()`;

const browser = await launchBrowser(Number(process.env.CDP_PORT ?? 9341));
let overflowCount = 0;
try {
  for (const item of CASES) {
    for (const theme of item.themes) {
      for (const widthName of item.widths) {
        const size = WIDTHS.find((w) => w.name === widthName);
        await browser.setViewport(size.width, size.height);
        await browser.setTheme(theme);
        await browser.open(distUrl(ROOT, item.search, item.hash), 1500);
        const probe = await browser.evaluate(OVERFLOW_PROBE);
        const file = join(OUT, `${item.name}-${widthName}-${theme}.png`);
        writeFileSync(file, await browser.screenshot());
        const overflow = probe.sw > probe.cw;
        if (overflow) overflowCount++;
        console.log(
          `${item.name} ${widthName} ${theme}: ${overflow ? `横向溢出 ${probe.sw}>${probe.cw} ${probe.over.join(" | ")}` : "无横向溢出"}`,
        );
      }
    }
  }
} finally {
  await browser.close();
}
console.log(`截图目录：${OUT}；横向溢出 ${overflowCount} 处`);
if (overflowCount > 0) process.exitCode = 1;
