// 第二版看板截图验收：页面、演示场景、视口和主题矩阵，并检查页面级横向溢出。
// 用法：pnpm --filter @fleet/web build 后运行 node scripts/ui/shoot.mjs [标签]
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
const THEMES = ["light", "dark"];

const CASES = [
  ...["overview", "slots", "tasks", "task-wr8v2k"].map((page) => ({
    scenario: "busy",
    page,
    hash: page === "task-wr8v2k" ? "#/tasks/wr8v2k" : `#/${page}`,
    widths: WIDTHS.map(({ name }) => name),
    themes: THEMES,
    ready:
      page === "overview"
        ? `!!document.querySelector('[data-stat="tokens"] .text-28')`
        : page === "slots"
          ? 'document.querySelectorAll("[data-pool-row]").length === 4'
          : page === "tasks"
            ? 'document.querySelectorAll("[data-task-row]").length === 30'
            : 'document.querySelectorAll("[data-timeline-row]").length === 19',
  })),
  ...["empty", "disabled"].flatMap((scenario) =>
    ["overview", "slots"].map((page) => ({
      scenario,
      page,
      hash: `#/${page}`,
      widths: ["1440"],
      themes: ["light"],
      ready:
        scenario === "empty"
          ? page === "overview"
            ? '!!document.querySelector("[data-stats-empty]")'
            : 'document.querySelectorAll("[data-pool-row]").length === 4'
          : page === "overview"
            ? `!!document.querySelector('[data-stat="slots"] [data-slots-bar]')`
            : '!!document.querySelector("[data-all-disabled]")',
    })),
  ),
  ...["offline", "failure"].map((scenario) => ({
    scenario,
    page: "overview",
    hash: "#/overview",
    widths: ["1440"],
    themes: ["light"],
    ready:
      scenario === "offline"
        ? `!!document.querySelector('[data-banner="offline"]')`
        : `!!document.querySelector('[data-banner="config"]')`,
  })),
];

const OVERFLOW_PROBE = `(() => {
  const clientWidth = document.documentElement.clientWidth;
  const scrollWidth = document.documentElement.scrollWidth;
  const elements = [];
  for (const element of document.querySelectorAll("body *")) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.right > clientWidth + 1) {
      const className = typeof element.className === "string" ? element.className : "";
      elements.push({
        tag: element.tagName.toLowerCase(),
        className: className.split(/\\s+/)[0] ?? "",
        right: Math.round(rect.right),
      });
    }
  }
  return { clientWidth, scrollWidth, elements: elements.slice(0, 8) };
})()`;

const browser = await launchBrowser(Number(process.env.CDP_PORT ?? 9341));
let overflowCount = 0;
try {
  for (const item of CASES) {
    for (const theme of item.themes) {
      for (const widthName of item.widths) {
        const size = WIDTHS.find(({ name }) => name === widthName);
        await browser.setViewport(size.width, size.height);
        await browser.setTheme(theme);
        await browser.open(distUrl(ROOT, `?demo=${item.scenario}`, item.hash), 0);
        const ready = await browser.waitFor(
          `document.readyState === "complete" && (${item.ready})`,
          3000,
        );
        const probe = await browser.evaluate(OVERFLOW_PROBE);
        const file = join(OUT, `${item.scenario}-${item.page}-${widthName}-${theme}.png`);
        writeFileSync(file, await browser.screenshot());
        const overflow = probe.scrollWidth > probe.clientWidth;
        if (overflow) overflowCount += 1;
        const status = overflow
          ? `横向溢出 ${probe.scrollWidth}>${probe.clientWidth} ${JSON.stringify(probe.elements)}`
          : "无横向溢出";
        console.log(
          `${item.scenario}/${item.page} ${widthName} ${theme}: ${ready ? "页面已就绪" : "页面未在 3 秒内就绪"}；${status}`,
        );
      }
    }
  }
} finally {
  await browser.close();
}

const shotCount = CASES.reduce((total, item) => total + item.widths.length * item.themes.length, 0);
console.log(`截图目录：${OUT}；共 ${shotCount} 张；横向溢出 ${overflowCount} 处`);
if (overflowCount > 0) process.exitCode = 1;
