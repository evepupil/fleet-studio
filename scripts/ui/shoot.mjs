// 第三版看板截图验收：场景、页面、视口和主题矩阵，并逐张检查页面级横向溢出。
// 用法：构建完成后运行 node scripts/ui/shoot.mjs [标签]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { distUrl, launchBrowser } from "./cdp.mjs";
import { clickElement, hoverElement } from "./interactions.mjs";

const ROOT = process.cwd();
const TAG = process.argv[2] ?? "latest";
const OUT = join(ROOT, ".fleet", "shots", TAG);
mkdirSync(OUT, { recursive: true });

const WIDTHS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1024", width: 1024, height: 768 },
  { name: "800", width: 800, height: 900 },
  { name: "390", width: 390, height: 844 },
];
const THEMES = ["light", "dark"];
const BUSY_PAGES = [
  { page: "board", hash: "#/tasks" },
  { page: "list", hash: "#/tasks/list" },
  { page: "detail", hash: "#/tasks/wr8v2k" },
  { page: "slots", hash: "#/slots" },
  { page: "overview", hash: "#/overview" },
];
const OTHER_PAGES = [
  { page: "board", hash: "#/tasks" },
  { page: "slots", hash: "#/slots" },
  { page: "overview", hash: "#/overview" },
];
const OVERFLOW_PROBE = `(() => {
  const clientWidth = document.documentElement.clientWidth;
  const scrollWidth = document.documentElement.scrollWidth;
  const elements = [];
  if (scrollWidth > clientWidth) {
    for (const element of document.querySelectorAll("body *")) {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || (rect.left >= 0 && rect.right <= clientWidth)) continue;
      const data = [...element.attributes]
        .filter((attribute) => attribute.name.startsWith("data-"))
        .slice(0, 2)
        .map((attribute) => [attribute.name, attribute.value]);
      elements.push({
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        className: (element.getAttribute("class") || "").split(/\\s+/).slice(0, 3).join(" "),
        data,
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      });
    }
  }
  return { clientWidth, scrollWidth, elements };
})()`;

const browser = await launchBrowser(Number(process.env.CDP_PORT ?? 9341));
let shotCount = 0;
let overflowCount = 0;
let notReadyCount = 0;
let sequence = 0;
const overflowResults = [];
const q = (selector) => `document.querySelector(${JSON.stringify(selector)})`;
const qa = (selector) => `document.querySelectorAll(${JSON.stringify(selector)})`;
const dataEl = (attribute, value) =>
  `[...document.querySelectorAll(${JSON.stringify(`[${attribute}]`)})].find((element) => element.getAttribute(${JSON.stringify(attribute)}) === ${JSON.stringify(value)})`;

function recordOverflow(fileName, result) {
  const hasOverflow = result.scrollWidth > result.clientWidth;
  if (hasOverflow) overflowCount += 1;
  overflowResults.push({ fileName, hasOverflow, ...result });
  return hasOverflow;
}

function writeOverflowReport() {
  const details = overflowResults.map(
    ({ fileName, hasOverflow, clientWidth, scrollWidth, elements }) =>
      `${hasOverflow ? "溢出" : "正常"} ${fileName} ${scrollWidth}/${clientWidth}${hasOverflow ? ` ${JSON.stringify(elements)}` : ""}`,
  );
  const overflowFiles = overflowResults
    .filter((result) => result.hasOverflow)
    .map((result) => result.fileName);
  const report = [
    `截图数：${shotCount}`,
    `横向溢出：${overflowCount} 张`,
    `未就绪：${notReadyCount} 张`,
    "",
    "逐图结果：",
    ...(details.length > 0 ? details : ["无已生成截图"]),
    "",
    "有横向溢出的截图：",
    ...(overflowFiles.length > 0 ? overflowFiles : ["无"]),
  ].join("\n");
  writeFileSync(join(OUT, "overflow.txt"), `${report}\n`);
}

async function waitFor(expression, description, timeoutMs = 8000) {
  if (!(await browser.waitFor(expression, timeoutMs))) {
    throw new Error(`等待超时：${description}`);
  }
}

async function navigate(scenario, hash, width, height, theme) {
  sequence += 1;
  await browser.setViewport(width, height);
  await browser.setTheme(theme);
  await browser.open(distUrl(ROOT, `?demo=${scenario}&shot=${sequence}`, hash), 0);
  await waitFor(
    'document.readyState === "complete" && !!document.querySelector("[data-workspace]")',
    "工作区出现",
  );
  await browser.evaluate("localStorage.clear(); sessionStorage.clear()");
  await browser.reload();
  await waitFor(
    'document.readyState === "complete" && !!document.querySelector("[data-workspace]")',
    "清理存储后工作区出现",
  );
}

function readyExpression(scenario, page) {
  const body = '!!document.querySelector("[data-page-body]")';
  const content = {
    board:
      scenario === "empty"
        ? '!!document.querySelector("[data-empty-board]")'
        : 'document.querySelectorAll("[data-board-column]").length === 3',
    list: 'document.querySelectorAll("[data-task-row]").length === 50',
    detail: 'document.querySelectorAll("[data-timeline-row]").length === 19',
    slots:
      scenario === "disabled"
        ? '!!document.querySelector("[data-all-disabled]") && document.querySelectorAll("[data-pool-row]").length === 4'
        : 'document.querySelectorAll("[data-pool-row]").length === 4',
    overview:
      scenario === "empty"
        ? '!!document.querySelector("[data-stats-empty]")'
        : scenario === "disabled"
          ? 'document.querySelector("[data-stat=\\"slots\\"]")?.textContent.replace(/\\s+/g, "").includes("停用4个池") === true'
          : '!!document.querySelector("[data-stat=\\"tokens\\"]") && /\\d/.test(document.querySelector("[data-stat=\\"tokens\\"]").textContent.replace(/\\s+/g, ""))',
  }[page];
  const scenarioMarker =
    scenario === "offline"
      ? '!!document.querySelector("[data-banner=\\"offline\\"]")'
      : scenario === "failure"
        ? '!!document.querySelector("[data-banner=\\"config\\"]")'
        : "true";
  return `document.readyState === "complete" && (${body}) && (${content}) && (${scenarioMarker})`;
}

async function capture(scenario, page, hash, widthName, theme, ready) {
  const size = WIDTHS.find((item) => item.name === widthName);
  if (!size) throw new Error(`未知视口：${widthName}`);
  await navigate(scenario, hash, size.width, size.height, theme);
  const pageReady = await browser.waitFor(ready, 8000);
  if (!pageReady) {
    notReadyCount += 1;
    console.log(`${scenario}/${page} ${widthName} ${theme}: 页面未在 8 秒内就绪；跳过截图`);
    return;
  }
  const overflow = await browser.evaluate(OVERFLOW_PROBE);
  const filename = `${scenario}-${page}-${widthName}-${theme}.png`;
  const file = join(OUT, filename);
  writeFileSync(file, await browser.screenshot());
  shotCount += 1;
  const hasOverflow = recordOverflow(filename, overflow);
  const status = hasOverflow
    ? `横向溢出 ${overflow.scrollWidth}>${overflow.clientWidth}，越界元素：${JSON.stringify(overflow.elements)}`
    : "无横向溢出";
  console.log(
    `${scenario}/${page} ${widthName} ${theme}: ${pageReady ? "页面已就绪" : "页面未在 8 秒内就绪"}；${status}`,
  );
}

async function captureInteractive(
  scene,
  page,
  scenario,
  hash,
  width,
  height,
  theme,
  ready,
  interact,
) {
  await navigate(scenario, hash, width, height, theme);
  await waitFor(ready, `${scene} 截图前页面就绪`);
  await interact();
  // 菜单、弹层、抽屉都有 160 毫秒的淡入，立刻拍会拍成半透明；等动画走完再拍
  await new Promise((resolve) => setTimeout(resolve, 400));
  const widthName = String(width);
  const overflow = await browser.evaluate(OVERFLOW_PROBE);
  const filename = `${scene}-${page}-${widthName}-${theme}.png`;
  const file = join(OUT, filename);
  writeFileSync(file, await browser.screenshot());
  shotCount += 1;
  const hasOverflow = recordOverflow(filename, overflow);
  const status = hasOverflow
    ? `横向溢出 ${overflow.scrollWidth}>${overflow.clientWidth}，越界元素：${JSON.stringify(overflow.elements)}`
    : "无横向溢出";
  console.log(`${scene}/${page} ${widthName} ${theme}: 交互状态已就绪；${status}`);
}

async function click(selector) {
  await clickElement(browser, q(selector));
}

async function setInput(selector, value) {
  const assigned = await browser.evaluate(`(() => {
    const input = ${q(selector)};
    if (!(input instanceof HTMLInputElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) return false;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  if (!assigned) throw new Error(`无法设置受控输入框：${selector}`);
}

try {
  for (const { page, hash } of BUSY_PAGES) {
    for (const theme of THEMES) {
      for (const { name: widthName } of WIDTHS) {
        const ready = readyExpression("busy", page);
        await capture("busy", page, hash, widthName, theme, ready);
      }
    }
  }

  for (const scenario of ["empty", "failure", "offline", "disabled"]) {
    for (const { page, hash } of OTHER_PAGES) {
      for (const theme of THEMES) {
        for (const { name: widthName } of [WIDTHS[0], WIDTHS.at(-1)]) {
          await capture(scenario, page, hash, widthName, theme, readyExpression(scenario, page));
        }
      }
    }
  }

  for (const theme of THEMES) {
    await captureInteractive(
      "interactive-search",
      "board",
      "busy",
      "#/tasks",
      1440,
      900,
      theme,
      '!!document.querySelector("[data-search-trigger]")',
      async () => {
        await click("[data-search-trigger]");
        await waitFor('!!document.querySelector("[data-search-dialog]")', "搜索弹窗打开");
        await waitFor(
          'document.querySelectorAll("[data-search-result]").length === 8',
          "最近搜索结果加载",
        );
        const recent = await browser.evaluate(
          `[...${qa("[data-search-result]")}].map((result) => result.getAttribute("data-search-result"))`,
        );
        await setInput("[data-search-input]", "评审");
        await waitFor(
          `(() => {
            const input = ${q("[data-search-input]")};
            const ids = [...${q("[data-search-dialog]")}.querySelectorAll("[data-search-result]")]
              .map((result) => result.getAttribute("data-search-result"));
            return input?.value === "评审" && ids.length > 0 && JSON.stringify(ids) !== ${JSON.stringify(JSON.stringify(recent))};
          })()`,
          "评审搜索结果更新",
        );
      },
    );

    await captureInteractive(
      "interactive-filter-submenu",
      "list",
      "busy",
      "#/tasks/list",
      1440,
      900,
      theme,
      'document.querySelectorAll("[data-task-row]").length === 50',
      async () => {
        await click("[data-filter-trigger]");
        await waitFor('!!document.querySelector("[role=menu]")', "筛选菜单打开");
        await hoverElement(browser, dataEl("data-filter-field", "status"));
        await waitFor(
          'document.querySelectorAll("[role=menu]").length >= 2 && !!document.querySelector("[data-filter-option=\\"status:active\\"]")',
          "状态二级菜单展开",
        );
      },
    );

    await captureInteractive(
      "interactive-display-menu",
      "board",
      "busy",
      "#/tasks",
      1440,
      900,
      theme,
      'document.querySelectorAll("[data-board-column]").length === 3',
      async () => {
        await click("[data-display-trigger]");
        await waitFor('!!document.querySelector("[data-display-menu]")', "看板显示弹层打开");
      },
    );

    await captureInteractive(
      "interactive-failed-column",
      "board",
      "busy",
      "#/tasks",
      1440,
      900,
      theme,
      '!!document.querySelector("[data-ended-row=\\"failed\\"]")',
      async () => {
        await click('[data-ended-row="failed"]');
        await waitFor('!!document.querySelector("[data-board-column=\\"failed\\"]")', "失败列展开");
      },
    );

    await captureInteractive(
      "interactive-disable-confirm",
      "slots",
      "busy",
      "#/slots",
      1440,
      900,
      theme,
      'document.querySelectorAll("[data-pool-row]").length === 4',
      async () => {
        await click('[data-pool-toggle="glmf"]');
        await waitFor('!!document.querySelector("[data-disable-dialog]")', "停用确认框打开");
      },
    );
  }

  await captureInteractive(
    "interactive-sidebar-drawer",
    "board",
    "busy",
    "#/tasks",
    390,
    844,
    "light",
    '!!document.querySelector("[data-sidebar-toggle]")',
    async () => {
      await click("[data-sidebar-toggle]");
      await waitFor('!!document.querySelector("[data-nav-drawer]")', "侧栏抽屉打开");
    },
  );
} finally {
  writeOverflowReport();
  await browser.close();
}

console.log(
  `截图目录：${OUT}；共 ${shotCount} 张；横向溢出 ${overflowCount} 处；未就绪 ${notReadyCount} 张`,
);
if (overflowCount > 0 || notReadyCount > 0) process.exitCode = 1;
