// 第三版看板验收：逐项对照六张页面规格末尾的交互检查表。
// 用法：构建完成后运行 node scripts/ui/probe.mjs
import { distUrl, launchBrowser } from "./cdp.mjs";
import { chooseSelectOption, clickElement, clickMenuItem, hoverElement } from "./interactions.mjs";

const ROOT = process.cwd();
const browser = await launchBrowser(Number(process.env.CDP_PORT ?? 9342));
const results = [];
let navigation = 0;
const q = (selector) => `document.querySelector(${JSON.stringify(selector)})`;
const qa = (selector) => `document.querySelectorAll(${JSON.stringify(selector)})`;
const dataEl = (attribute, value, scope = "document") =>
  `[...${scope}.querySelectorAll(${JSON.stringify(`[${attribute}]`)})].find((element) => element.getAttribute(${JSON.stringify(attribute)}) === ${JSON.stringify(value)})`;

function printResult(name, actual, expected, ok, error = null) {
  results.push({ name, actual, expected, ok, error });
  if (ok) {
    console.log(`通过：${name}`);
  } else {
    const reason = error ?? `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`;
    console.log(`不通过：${name}；原因：${reason}`);
  }
}

// UI text is often split across elements, so normalize whitespace before asserting results.
function normalizeStrings(value) {
  if (typeof value === "string") return value.replace(/\s+/g, "");
  if (Array.isArray(value)) return value.map(normalizeStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeStrings(entry)]),
    );
  }
  return value;
}

async function waitFor(expression, description = expression, timeoutMs = 8000) {
  if (!(await browser.waitFor(expression, timeoutMs))) {
    throw new Error(`等待超时：${description}`);
  }
}

async function click(selector) {
  await clickElement(browser, q(selector));
}

async function clickExpr(expression) {
  await clickElement(browser, expression);
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

async function openDemo(scenario, hash, options = {}) {
  navigation += 1;
  await browser.setViewport(options.width ?? 1440, options.height ?? 900);
  await browser.setTheme(options.theme ?? "light");
  browser.clearPageErrors();
  await browser.open(distUrl(ROOT, `?demo=${scenario}&check=${navigation}`, hash), 0);
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

async function check(
  name,
  scenario,
  hash,
  run,
  expected,
  matches = (actual, wanted) => JSON.stringify(actual) === JSON.stringify(wanted),
  options = {},
) {
  try {
    await openDemo(scenario, hash, options);
    const actual = normalizeStrings(await run());
    const normalizedExpected = normalizeStrings(expected);
    printResult(name, actual, normalizedExpected, matches(actual, normalizedExpected));
  } catch (error) {
    printResult(
      name,
      null,
      expected,
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    const pageErrors = browser.takePageErrors();
    if (pageErrors.length > 0) {
      printResult(
        `${name.split("：")[0]}：页面无运行时异常和 console.error`,
        pageErrors,
        [],
        false,
        pageErrors.join("；"),
      );
    }
  }
}

async function openFilterSubmenu(field) {
  await click("[data-filter-trigger]");
  await waitFor('!!document.querySelector("[role=menu]")', "筛选菜单打开");
  await hoverElement(browser, dataEl("data-filter-field", field));
  await waitFor(
    `${dataEl("data-filter-option", `${field}:${field === "status" ? "active" : field === "pool" ? "glmf" : "__all__"}`)} !== undefined`,
    `${field} 二级菜单展开`,
  );
}

async function selectFilterOption(field, value) {
  await openFilterSubmenu(field);
  await clickMenuItem(browser, dataEl("data-filter-option", `${field}:${value}`));
}

async function openDisplayMenu() {
  if (!(await browser.evaluate(`!!${q("[data-display-menu]")}`))) {
    await click("[data-display-trigger]");
  }
  await waitFor(`!!${q("[data-display-menu]")}`, "显示弹层打开");
}

try {
  // 骨架：路由、侧栏、全局提示和搜索。
  await check(
    "骨架：侧栏三项依次为任务、槽位、总览",
    "busy",
    "#/overview",
    async () => {
      await waitFor(`${qa("[data-nav-item]")}.length === 3`, "三个主导航项");
      return browser.evaluate(`[...${qa("[data-nav-item]")}].map((item) => item.dataset.navItem)`);
    },
    ["tasks", "slots", "overview"],
  );

  await check(
    "骨架：根路由重定向到任务并高亮",
    "busy",
    "#/",
    async () => {
      await waitFor('location.hash === "#/tasks"', "根路由跳到任务");
      return browser.evaluate(
        `({ hash: location.hash, current: ${q('[data-nav-item="tasks"]')}?.getAttribute("aria-current") ?? null })`,
      );
    },
    { hash: "#/tasks", current: "page" },
  );

  await check(
    "骨架：未知路由重定向到任务",
    "busy",
    "#/nope",
    async () => {
      await waitFor('location.hash === "#/tasks"', "未知路由跳到任务");
      return browser.evaluate("location.hash");
    },
    "#/tasks",
  );

  await check(
    "骨架：旧版详情路由转到新路由并高亮任务",
    "busy",
    "#/w/wr8v2k",
    async () => {
      await waitFor('location.hash === "#/tasks/wr8v2k"', "旧详情路由完成重定向");
      return browser.evaluate(
        `({ hash: location.hash, current: ${q('[data-nav-item="tasks"]')}?.getAttribute("aria-current") ?? null })`,
      );
    },
    { hash: "#/tasks/wr8v2k", current: "page" },
  );

  await check(
    "骨架：点击槽位导航更新路由、标题和文档标题",
    "busy",
    "#/overview",
    async () => {
      await click('[data-nav-item="slots"]');
      await waitFor(
        `${q("[data-view-bar] h1")}?.textContent.replace(/\\s+/g, "") === "槽位"`,
        "槽位标题渲染",
      );
      return browser.evaluate(`({
      hash: location.hash,
      current: ${q('[data-nav-item="slots"]')}?.getAttribute("aria-current") ?? null,
      title: ${q("[data-view-bar] h1")}?.textContent.trim() ?? null,
      documentTitle: document.title,
    })`);
    },
    { hash: "#/slots", current: "page", title: "槽位", documentTitle: "槽位 · fleet studio" },
  );

  await check(
    "骨架：busy 侧栏进行中徽标为 30",
    "busy",
    "#/overview",
    async () => {
      await waitFor(
        `${q("[data-nav-count]")}?.textContent.replace(/\\s+/g, "") === "30"`,
        "进行中徽标加载",
      );
      return browser.evaluate(`${q("[data-nav-count]")}?.textContent.trim() ?? null`);
    },
    "30",
  );

  await check(
    "骨架：busy 窗口栏占用数含 23/40 和排队 7",
    "busy",
    "#/overview",
    async () => {
      await waitFor(`!!${q("[data-occupancy]")}`, "窗口栏占用数出现");
      return browser.evaluate(
        `${q("[data-occupancy]")}?.textContent.replace(/\\s+/g, " ").trim() ?? null`,
      );
    },
    "槽位 23/40 · 排队 7",
    (actual) => actual?.includes("23/40") === true && actual.includes("排队7"),
  );

  await check(
    "骨架：busy 项目分组有 6 项且首项 key 保留反斜杠",
    "busy",
    "#/overview",
    async () => {
      await waitFor(`${qa("[data-nav-project]")}.length === 6`, "侧栏项目分组加载");
      return browser.evaluate(`({
      count: ${qa("[data-nav-project]")}.length,
      first: ${qa("[data-nav-project]")}[0]?.getAttribute("data-nav-project") ?? null,
    })`);
    },
    { count: 6, first: "c:\\code\\wiki-forge" },
  );

  await check(
    "骨架：点击首个项目只高亮项目任务项",
    "busy",
    "#/overview",
    async () => {
      await waitFor(`${qa("[data-nav-project]")}.length === 6`, "侧栏项目分组加载");
      await clickExpr(`${qa("[data-nav-project]")}[0]`);
      await waitFor(
        `${qa("[data-nav-project]")}[0]?.getAttribute("aria-current") === "page"`,
        "首个项目高亮",
      );
      return browser.evaluate(`({
      hash: location.hash,
      projectCurrent: ${qa("[data-nav-project]")}[0]?.getAttribute("aria-current") ?? null,
      tasksCurrent: ${q('[data-nav-item="tasks"]')}?.getAttribute("aria-current") ?? null,
    })`);
    },
    { hash: "#/tasks", projectCurrent: "page", tasksCurrent: null },
  );

  await check(
    "骨架：侧栏收起展开且刷新保留收起状态",
    "busy",
    "#/overview",
    async () => {
      await click("[data-sidebar-toggle]");
      await waitFor(`${q("[data-nav]")}?.dataset.state === "closed"`, "侧栏收起");
      const closed = await browser.evaluate(`${q("[data-nav]")}?.dataset.state ?? null`);
      await click("[data-sidebar-toggle]");
      await waitFor(`${q("[data-nav]")}?.dataset.state === "open"`, "侧栏展开");
      await click("[data-sidebar-toggle]");
      await waitFor(`${q("[data-nav]")}?.dataset.state === "closed"`, "侧栏再次收起");
      await browser.reload();
      await waitFor(`${q("[data-nav]")}?.dataset.state === "closed"`, "刷新后侧栏仍收起");
      return {
        closed,
        reopened: "open",
        afterReload: await browser.evaluate(`${q("[data-nav]")}?.dataset.state ?? null`),
      };
    },
    { closed: "closed", reopened: "open", afterReload: "closed" },
  );

  await check(
    "骨架：800 宽打开侧栏抽屉并导航后关闭",
    "busy",
    "#/tasks",
    async () => {
      await browser.setViewport(800, 900);
      await waitFor(`!${q("[data-nav]")}`, "窄屏不渲染桌面侧栏");
      await click("[data-sidebar-toggle]");
      await waitFor(`!!${q("[data-nav-drawer]")}`, "侧栏抽屉打开");
      const itemCount = await browser.evaluate(
        `${q("[data-nav-drawer]")}?.querySelectorAll("[data-nav-item]").length ?? 0`,
      );
      await clickExpr(`${dataEl("data-nav-item", "slots", q("[data-nav-drawer]"))}`);
      await waitFor(
        'location.hash === "#/slots" && !document.querySelector("[data-nav-drawer]")',
        "导航后抽屉关闭",
      );
      return {
        itemCount,
        hash: await browser.evaluate("location.hash"),
        drawerOpen: await browser.evaluate(`!!${q("[data-nav-drawer]")}`),
      };
    },
    { itemCount: 3, hash: "#/slots", drawerOpen: false },
    undefined,
    { width: 800, height: 900 },
  );

  await check(
    "骨架：offline 显示断线提示且工作区标记离线",
    "offline",
    "#/overview",
    async () => {
      await waitFor(`!!${q('[data-banner="offline"]')}`, "断线提示出现");
      return browser.evaluate(`({
      text: ${q('[data-banner="offline"]')}?.textContent.replace(/\\s+/g, "") ?? null,
      offline: ${q("[data-workspace]")}?.dataset.offline ?? null,
    })`);
    },
    { text: "连接已断开，正在重连", offline: "true" },
  );

  await check(
    "骨架：failure 显示配置错误提示",
    "failure",
    "#/overview",
    async () => {
      await waitFor(`!!${q('[data-banner="config"]')}`, "配置错误提示出现");
      return browser.evaluate(`!!${q('[data-banner="config"]')}`);
    },
    true,
  );

  await check(
    "骨架：点击搜索入口显示最近 8 条并聚焦输入框",
    "busy",
    "#/overview",
    async () => {
      await click("[data-search-trigger]");
      await waitFor(
        `${q("[data-search-dialog]")} && ${qa("[data-search-result]")}.length === 8`,
        "搜索弹窗及最近任务加载",
      );
      return browser.evaluate(`({
      focused: document.activeElement === ${q("[data-search-input]")},
      first: ${qa("[data-search-result]")}[0]?.dataset.searchResult ?? null,
      recentLabel: ${q("[data-search-dialog]")}?.textContent.replace(/\\s+/g, "").includes("最近") ?? false,
      count: ${qa("[data-search-result]")}.length,
    })`);
    },
    { focused: true, first: "wp8r3v", recentLabel: true, count: 8 },
    (actual, expected) =>
      actual?.focused === expected.focused &&
      actual.first === expected.first &&
      actual.recentLabel === expected.recentLabel &&
      actual.count === expected.count,
  );

  await check(
    "骨架：Ctrl+K 可打开并再次关闭搜索弹窗",
    "busy",
    "#/overview",
    async () => {
      await browser.pressKey("Control+K");
      await waitFor(`!!${q("[data-search-dialog]")}`, "快捷键打开搜索");
      await browser.pressKey("Control+K");
      await waitFor(`!${q("[data-search-dialog]")}`, "再次按快捷键关闭搜索");
      return browser.evaluate(`!!${q("[data-search-dialog]")}`);
    },
    false,
  );

  await check(
    "骨架：搜索 wr8v2k 后回车进入详情并关闭弹窗",
    "busy",
    "#/overview",
    async () => {
      await click("[data-search-trigger]");
      await waitFor(`!!${q("[data-search-input]")}`, "搜索输入框出现");
      await setInput("[data-search-input]", "wr8v2k");
      await waitFor(
        `${qa("[data-search-result]")}[0]?.dataset.searchResult === "wr8v2k"`,
        "详情搜索结果出现",
      );
      await browser.pressKey("Enter");
      await waitFor(
        'location.hash === "#/tasks/wr8v2k" && !document.querySelector("[data-search-dialog]")',
        "进入详情并关闭搜索",
      );
      return browser.evaluate(`({ hash: location.hash, dialog: !!${q("[data-search-dialog]")} })`);
    },
    { hash: "#/tasks/wr8v2k", dialog: false },
  );

  await check(
    "骨架：搜索 fake 后端首条结果为 wx2j3k",
    "busy",
    "#/overview",
    async () => {
      await click("[data-search-trigger]");
      await setInput("[data-search-input]", "fake 后端");
      await waitFor(
        `${qa("[data-search-result]")}[0]?.dataset.searchResult === "wx2j3k"`,
        "标题搜索结果出现",
      );
      return browser.evaluate(`${qa("[data-search-result]")}[0]?.dataset.searchResult ?? null`);
    },
    "wx2j3k",
  );

  await check(
    "骨架：无匹配搜索显示没有找到任务",
    "busy",
    "#/overview",
    async () => {
      await click("[data-search-trigger]");
      await setInput("[data-search-input]", "zzzz没有");
      await waitFor(
        `${q("[data-search-dialog]")}?.textContent.replace(/\\s+/g, "").includes("没有找到任务")`,
        "无匹配提示出现",
      );
      return browser.evaluate(
        `${q("[data-search-dialog]")}?.textContent.replace(/\\s+/g, "").includes("没有找到任务") ?? false`,
      );
    },
    true,
  );

  // 看板：列、任务卡、持久化、筛选和键盘导航。
  await check(
    "看板：busy 三列数量为 7、23、46",
    "busy",
    "#/tasks",
    async () => {
      await waitFor(`${qa("[data-board-column]")}.length === 3`, "看板三列加载");
      return browser.evaluate(
        `[...${qa("[data-board-column]")}].map((column) => ({ status: column.dataset.boardColumn, count: Number(column.dataset.count) }))`,
      );
    },
    [
      { status: "queued", count: 7 },
      { status: "running", count: 23 },
      { status: "completed", count: 46 },
    ],
  );

  await check(
    "看板：收起组为失败 5、已取消 6 且失败数标红",
    "busy",
    "#/tasks",
    async () => {
      await waitFor(`${qa("[data-ended-row]")}.length === 2`, "收起组加载");
      return browser.evaluate(`[...${qa("[data-ended-row]")}].map((row) => ({
      status: row.dataset.endedRow,
      count: Number(row.dataset.count),
      failedTone: row.dataset.endedRow === "failed" ? row.querySelector("[data-ended-count]")?.classList.contains("text-status-failed") ?? false : null,
    }))`);
    },
    [
      { status: "failed", count: 5, failedTone: true },
      { status: "cancelled", count: 6, failedTone: null },
    ],
  );

  await check(
    "看板：三列首卡依次为 wq6e7f、wk5n8s、wr8v2k",
    "busy",
    "#/tasks",
    async () => {
      await waitFor(`${qa("[data-board-column]")}.length === 3`, "看板列加载");
      return browser.evaluate(
        `[...${qa("[data-board-column]")}].map((column) => column.querySelector("[data-task-card]")?.dataset.taskCard ?? null)`,
      );
    },
    ["wq6e7f", "wk5n8s", "wr8v2k"],
  );

  await check(
    "看板：wx2j3k 进度标记为重试 3/8",
    "busy",
    "#/tasks",
    async () => {
      await waitFor(`!!${q('[data-task-card="wx2j3k"] [data-card-meta]')}`, "重试进度出现");
      return browser.evaluate(`({
      kind: ${q('[data-task-card="wx2j3k"] [data-card-meta]')}?.dataset.cardMeta ?? null,
      text: ${q('[data-task-card="wx2j3k"] [data-card-meta]')}?.textContent.trim() ?? null,
    })`);
    },
    { kind: "retry", text: "重试 3/8" },
  );

  await check(
    "看板：wp8r3v 排队位置为第 4 位",
    "busy",
    "#/tasks",
    async () => {
      await waitFor(`!!${q('[data-task-card="wp8r3v"] [data-card-meta]')}`, "排队位置出现");
      return browser.evaluate(
        `${q('[data-task-card="wp8r3v"] [data-card-meta]')}?.textContent.trim() ?? null`,
      );
    },
    "排队第 4 位",
  );

  await check(
    "看板：wn8t3u 显示公共排队第 3 位和公共排队池",
    "busy",
    "#/tasks",
    async () => {
      await waitFor(`!!${q('[data-task-card="wn8t3u"] [data-card-meta]')}`, "公共排队进度出现");
      return browser.evaluate(`({
      meta: ${q('[data-task-card="wn8t3u"] [data-card-meta]')}?.textContent.trim() ?? null,
      pool: ${q('[data-task-card="wn8t3u"] [data-card-pool]')}?.textContent.trim() ?? null,
    })`);
    },
    { meta: "公共排队第 3 位", pool: "公共排队" },
  );

  await check(
    "看板：wt2x5y 回报结论为不通过",
    "busy",
    "#/tasks",
    async () => {
      await waitFor(
        `!!${q('[data-task-card="wt2x5y"] [data-verdict="fail"]')}`,
        "失败回报标记出现",
      );
      return browser.evaluate(`({
      verdict: !!${q('[data-task-card="wt2x5y"] [data-verdict="fail"]')},
      text: ${q('[data-task-card="wt2x5y"] [data-verdict="fail"]')}?.textContent.trim() ?? null,
    })`);
    },
    { verdict: true, text: "不通过" },
  );

  await check(
    "看板：展开失败列后数量为 5 且紧随已完成列",
    "busy",
    "#/tasks",
    async () => {
      await click('[data-ended-row="failed"]');
      await waitFor(`${q('[data-board-column="failed"]')}?.dataset.count === "5"`, "失败列展开");
      return browser.evaluate(`({
      count: Number(${q('[data-board-column="failed"]')}?.dataset.count),
      previous: ${q('[data-board-column="failed"]')}?.previousElementSibling?.dataset.boardColumn ?? null,
      collapsed: [...${qa("[data-ended-row]")}].map((row) => row.dataset.endedRow),
    })`);
    },
    { count: 5, previous: "completed", collapsed: ["cancelled"] },
  );

  await check(
    "看板：刷新后失败列展开状态保留",
    "busy",
    "#/tasks",
    async () => {
      await click('[data-ended-row="failed"]');
      await waitFor(`!!${q('[data-board-column="failed"]')}`, "失败列展开");
      await browser.reload();
      await waitFor(`!!${q('[data-board-column="failed"]')}`, "刷新后失败列恢复");
      return browser.evaluate(`!!${q('[data-board-column="failed"]')}`);
    },
    true,
  );

  await check(
    "看板：收起失败列后短条恢复",
    "busy",
    "#/tasks",
    async () => {
      await click('[data-ended-row="failed"]');
      await waitFor(`!!${q('[data-collapse-column="failed"]')}`, "失败列展开");
      await click('[data-collapse-column="failed"]');
      await waitFor(
        `!${q('[data-board-column="failed"]')} && !!${q('[data-ended-row="failed"]')}`,
        "失败列收起",
      );
      return browser.evaluate(
        `({ column: !!${q('[data-board-column="failed"]')}, row: !!${q('[data-ended-row="failed"]')} })`,
      );
    },
    { column: false, row: true },
  );

  await check(
    "看板：选择 wiki-forge 后列数为 4、11、12 且失败 1",
    "busy",
    "#/tasks",
    async () => {
      await waitFor(`${qa("[data-nav-project]")}.length === 6`, "项目导航加载");
      await clickExpr(`${qa("[data-nav-project]")}[0]`);
      await waitFor(
        `${qa("[data-board-column]")}[0]?.dataset.count === "4" && ${qa("[data-board-column]")}[1]?.dataset.count === "11" && ${qa("[data-board-column]")}[2]?.dataset.count === "12"`,
        "项目看板列过滤",
      );
      return browser.evaluate(`({
      columns: [...${qa("[data-board-column]")}].map((column) => Number(column.dataset.count)),
      failed: ${q('[data-ended-row="failed"]')}?.dataset.count ?? null,
    })`);
    },
    { columns: [4, 11, 12], failed: "1" },
  );

  await check(
    "看板：搜索 fake 后端只剩工作中 wx2j3k",
    "busy",
    "#/tasks",
    async () => {
      await setInput('[data-filter="q"]', "fake 后端");
      await waitFor(
        `${qa("[data-task-card]")}.length === 1 && ${qa("[data-task-card]")}[0]?.dataset.taskCard === "wx2j3k"`,
        "看板标题过滤",
      );
      return browser.evaluate(`[...${qa("[data-board-column]")}].map((column) => ({
      status: column.dataset.boardColumn,
      count: Number(column.dataset.count),
      cards: column.querySelectorAll("[data-task-card]").length,
    }))`);
    },
    [
      { status: "queued", count: 0, cards: 0 },
      { status: "running", count: 1, cards: 1 },
      { status: "completed", count: 0, cards: 0 },
    ],
  );

  await check(
    "看板：无匹配标题显示空态，清除后列数恢复",
    "busy",
    "#/tasks",
    async () => {
      await setInput('[data-filter="q"]', "zzzz没有");
      await waitFor(
        `${q("[data-empty-board]")}?.textContent.replace(/\\s+/g, "").includes("没有符合条件的任务")`,
        "筛选空态出现",
      );
      const emptyText = await browser.evaluate(
        `${q("[data-empty-board]")}?.textContent.replace(/\\s+/g, "") ?? ""`,
      );
      await clickExpr(
        `[...${q("[data-empty-board]")}.querySelectorAll("button")].find((button) => button.textContent.replace(/\\s+/g, "") === "清除筛选")`,
      );
      await waitFor(
        `${qa("[data-board-column]")}.length === 3 && ${qa("[data-board-column]")}[0]?.dataset.count === "7" && ${qa("[data-board-column]")}[1]?.dataset.count === "23" && ${qa("[data-board-column]")}[2]?.dataset.count === "46"`,
        "清除筛选后看板恢复",
      );
      return {
        empty: emptyText.includes("没有符合条件的任务"),
        counts: await browser.evaluate(
          `[...${qa("[data-board-column]")}].map((column) => Number(column.dataset.count))`,
        ),
      };
    },
    { empty: true, counts: [7, 23, 46] },
  );

  await check(
    "看板：显示弹层关闭编号后卡片编号消失，再打开恢复",
    "busy",
    "#/tasks",
    async () => {
      await openDisplayMenu();
      await waitFor(`!!${q('[data-card-prop="id"]')}`, "编号显示开关出现");
      await click('[data-card-prop="id"]');
      await waitFor(`!${q("[data-card-id]")}`, "卡片编号关闭");
      await openDisplayMenu();
      await click('[data-card-prop="id"]');
      await waitFor(`!!${q("[data-card-id]")}`, "卡片编号恢复");
      return browser.evaluate(
        `({ cardIds: ${qa("[data-card-id]")}.length, pressed: ${q('[data-card-prop="id"]')}?.getAttribute("aria-pressed") ?? null })`,
      );
    },
    { visible: true, pressed: "true" },
    (actual) => actual?.cardIds > 0 && actual.pressed === "true",
  );

  await check(
    "看板：点击 wr8v2k 卡片进入对应详情",
    "busy",
    "#/tasks",
    async () => {
      await click('[data-task-card="wr8v2k"]');
      await waitFor('location.hash === "#/tasks/wr8v2k"', "看板卡片进入详情");
      return browser.evaluate("location.hash");
    },
    "#/tasks/wr8v2k",
  );

  await check(
    "看板：方向键从 wq6e7f 移到 wq2v5w 和 we8g3m",
    "busy",
    "#/tasks",
    async () => {
      await browser.evaluate(`${q('[data-task-card="wq6e7f"]')}?.focus()`);
      await browser.pressKey("ArrowDown");
      await waitFor(
        `document.activeElement?.dataset.taskCard === "wq2v5w"`,
        "向下移动到第二张排队卡",
      );
      const down = await browser.evaluate("document.activeElement?.dataset.taskCard ?? null");
      await browser.pressKey("ArrowRight");
      await waitFor(
        `document.activeElement?.dataset.taskCard === "we8g3m"`,
        "向右移动到工作中第二张卡",
      );
      return {
        down,
        right: await browser.evaluate("document.activeElement?.dataset.taskCard ?? null"),
      };
    },
    { down: "wq2v5w", right: "we8g3m" },
  );

  await check(
    "看板：failure 场景三列和收起数为 10、7、38、12、4",
    "failure",
    "#/tasks",
    async () => {
      await waitFor(
        `${qa("[data-board-column]")}.length === 3 && ${qa("[data-ended-row]")}.length === 2`,
        "failure 看板加载",
      );
      return browser.evaluate(`({
      columns: [...${qa("[data-board-column]")}].map((column) => Number(column.dataset.count)),
      ended: [...${qa("[data-ended-row]")}].map((row) => ({ status: row.dataset.endedRow, count: Number(row.dataset.count) })),
    })`);
    },
    {
      columns: [10, 7, 38],
      ended: [
        { status: "failed", count: 12 },
        { status: "cancelled", count: 4 },
      ],
    },
  );

  await check(
    "看板：empty 场景显示还没有任务和运行命令",
    "empty",
    "#/tasks",
    async () => {
      await waitFor(`!!${q("[data-empty-board]")}`, "看板空态出现");
      return browser.evaluate(`({
      empty: ${q("[data-empty-board]")}?.textContent.replace(/\\s+/g, "").includes("还没有任务") ?? false,
      command: ${q("[data-empty-board]")}?.textContent.replace(/\\s+/g, "").includes('fleetrun"任务"') ?? false,
    })`);
    },
    { empty: true, command: true },
  );

  await check(
    "看板：390 宽页面不溢出且看板内部可横滚",
    "busy",
    "#/tasks",
    async () => {
      await browser.setViewport(390, 844);
      await waitFor(`${qa("[data-board-column]")}.length === 3`, "窄屏看板加载");
      return browser.evaluate(`({
      pageFits: document.documentElement.scrollWidth === document.documentElement.clientWidth,
      boardScrolls: ${q("[data-board]")}?.scrollWidth > ${q("[data-board]")}?.clientWidth,
    })`);
    },
    { pageFits: true, boardScrolls: true },
    undefined,
    { width: 390, height: 844 },
  );

  // 任务列表：视图切换、筛选菜单、排序、分页和响应式表格。
  await check(
    "列表：看板标签当前选中且同时有列表标签",
    "busy",
    "#/tasks",
    async () => {
      await waitFor(`${qa("[data-view-tab]")}.length === 2`, "任务视图标签出现");
      return browser.evaluate(`[...${qa("[data-view-tab]")}].map((tab) => ({
      key: tab.dataset.viewTab,
      current: tab.getAttribute("aria-current"),
    }))`);
    },
    [
      { key: "board", current: "page" },
      { key: "list", current: null },
    ],
  );

  await check(
    "列表：切换列表后首屏 50 行且尚无合计",
    "busy",
    "#/tasks",
    async () => {
      await click('[data-view-tab="list"]');
      await waitFor(
        'location.hash === "#/tasks/list" && document.querySelectorAll("[data-task-row]").length === 50',
        "列表首屏加载 50 行",
      );
      return browser.evaluate(
        `({ hash: location.hash, rows: ${qa("[data-task-row]")}.length, total: !!${q("[data-task-total]")} })`,
      );
    },
    { hash: "#/tasks/list", rows: 50, total: false },
  );

  await check(
    "列表：滚动分页直到合计显示共 806 个",
    "busy",
    "#/tasks/list",
    async () => {
      await waitFor(`${qa("[data-task-row]")}.length === 50`, "列表第一页加载");
      for (let page = 0; page < 20; page += 1) {
        const state = await browser.evaluate(
          `({ rows: ${qa("[data-task-row]")}.length, total: ${q("[data-task-total]")}?.textContent.trim() ?? null })`,
        );
        if (state.total !== null) return state;
        await browser.evaluate(
          `(() => { const list = ${q("[data-task-list]")}; if (list) list.scrollTop = list.scrollHeight; })()`,
        );
        await browser.waitFor(
          `${qa("[data-task-row]")}.length > ${state.rows} || !!${q("[data-task-total]")}`,
          4000,
        );
      }
      return browser.evaluate(
        `({ rows: ${qa("[data-task-row]")}.length, total: ${q("[data-task-total]")}?.textContent.trim() ?? null })`,
      );
    },
    { rows: 806, total: "共 806 个" },
  );

  await check(
    "列表：状态二级菜单选进行中后有 30 行和状态标签",
    "busy",
    "#/tasks/list",
    async () => {
      await waitFor(`${qa("[data-task-row]")}.length === 50`, "列表数据加载");
      await selectFilterOption("status", "active");
      await waitFor(
        `${qa("[data-task-row]")}.length === 30 && !!${q('[data-chip="status"]')}`,
        "进行中筛选结果",
      );
      return browser.evaluate(`({
      rows: ${qa("[data-task-row]")}.length,
      chip: ${q('[data-chip="status"]')}?.textContent.trim() ?? null,
    })`);
    },
    { rows: 30, chip: "状态：进行中" },
  );

  await check(
    "列表：移除状态标签后回到 50 行",
    "busy",
    "#/tasks/list",
    async () => {
      await selectFilterOption("status", "active");
      await waitFor(`!!${q('[data-chip="status"]')}`, "状态标签出现");
      await clickExpr(`${q('[data-chip="status"]')}?.querySelector("button")`);
      await waitFor(
        `${qa("[data-task-row]")}.length === 50 && !${q('[data-chip="status"]')}`,
        "移除状态条件",
      );
      return {
        rows: await browser.evaluate(`${qa("[data-task-row]")}.length`),
        chip: await browser.evaluate(`!!${q('[data-chip="status"]')}`),
      };
    },
    { rows: 50, chip: false },
  );

  await check(
    "列表：搜索 fake 后端只剩 wx2j3k 且标记重试 3/8",
    "busy",
    "#/tasks/list",
    async () => {
      await setInput('[data-filter="q"]', "fake 后端");
      await waitFor(
        `${qa("[data-task-row]")}.length === 1 && !!${q('[data-task-row="wx2j3k"] [data-row-flag="retry"]')}`,
        "标题搜索结果及重试标记",
      );
      return browser.evaluate(`({
      id: ${qa("[data-task-row]")}[0]?.dataset.taskRow ?? null,
      flag: ${q('[data-task-row="wx2j3k"] [data-row-flag="retry"]')}?.textContent.trim() ?? null,
    })`);
    },
    { id: "wx2j3k", flag: "重试 3/8" },
  );

  await check(
    "列表：清除筛选和搜索后恢复 50 行",
    "busy",
    "#/tasks/list",
    async () => {
      await setInput('[data-filter="q"]', "fake 后端");
      await waitFor(`${qa("[data-task-row]")}.length === 1`, "搜索结果出现");
      await click("[data-clear-filters]");
      await waitFor(
        `${qa("[data-task-row]")}.length === 50 && ${q('[data-filter="q"]')}?.value === "" && !${q("[data-active-filters]")}?.querySelector("[data-chip]")`,
        "清空筛选后恢复",
      );
      return browser.evaluate(
        `({ rows: ${qa("[data-task-row]")}.length, query: ${q('[data-filter="q"]')}?.value ?? null, chips: ${qa("[data-chip]")}.length })`,
      );
    },
    { rows: 50, query: "", chips: 0 },
  );

  await check(
    "列表：排序选用量后第一行用量不低于第二行",
    "busy",
    "#/tasks/list",
    async () => {
      await waitFor(`${qa("[data-task-row]")}.length === 50`, "列表数据加载");
      await click("[data-display-trigger]");
      await waitFor(`!!${q("[data-sort-key]")}`, "排序控件出现");
      await chooseSelectOption(browser, "[data-sort-key]", "用量");
      await waitFor(`${qa("[data-task-row]")}.length >= 2`, "排序结果出现");
      return browser.evaluate(`(() => {
      const rows = [...${qa("[data-task-row]")}];
      const value = (row) => {
        const text = row.querySelector("td:nth-child(7)")?.textContent.replace(/\\s+/g, "") ?? "";
        const match = text.match(/([\\d,.]+)\\s*([KM]?)/i);
        if (!match) return Number.NaN;
        const scale = match[2]?.toUpperCase() === "M" ? 1000000 : match[2]?.toUpperCase() === "K" ? 1000 : 1;
        return Number(match[1].replace(/,/g, "")) * scale;
      };
      return { first: value(rows[0]), second: value(rows[1]), sorted: value(rows[0]) >= value(rows[1]) };
    })()`);
    },
    { sorted: true },
    (actual) => actual?.sorted === true,
  );

  await check(
    "列表：点击首行进入该任务详情",
    "busy",
    "#/tasks/list",
    async () => {
      await waitFor(`${qa("[data-task-row]")}.length === 50`, "列表数据加载");
      const id = await browser.evaluate(`${qa("[data-task-row]")}[0]?.dataset.taskRow ?? null`);
      if (!id) throw new Error("列表没有首行任务编号");
      await clickExpr(`${dataEl("data-task-row", id)}`);
      await waitFor(`location.hash === ${JSON.stringify(`#/tasks/${id}`)}`, "首行详情打开");
      return { id, hash: await browser.evaluate("location.hash") };
    },
    null,
    (actual) => actual?.id && actual.hash === `#/tasks/${actual.id}`,
  );

  await check(
    "列表：看板显示弹层有五个全部开启的卡片属性",
    "busy",
    "#/tasks",
    async () => {
      await openDisplayMenu();
      await waitFor(`${qa("[data-card-prop]")}.length === 5`, "看板卡片属性显示");
      return browser.evaluate(
        `[...${qa("[data-card-prop]")}].map((item) => ({ key: item.dataset.cardProp, pressed: item.getAttribute("aria-pressed") }))`,
      );
    },
    [
      { key: "id", pressed: "true" },
      { key: "pool", pressed: "true" },
      { key: "project", pressed: "true" },
      { key: "role", pressed: "true" },
      { key: "meta", pressed: "true" },
    ],
  );

  await check(
    "列表：看板筛选菜单仅有项目、池、角色",
    "busy",
    "#/tasks",
    async () => {
      await click("[data-filter-trigger]");
      await waitFor(`!!${q("[data-filter-menu]")}`, "筛选菜单打开");
      return browser.evaluate(
        `[...${qa("[data-filter-field]")}].map((item) => item.dataset.filterField)`,
      );
    },
    ["project", "pool", "role"],
  );

  await check(
    "列表：看板筛选池 glmf 后有标签且工作中为 4",
    "busy",
    "#/tasks",
    async () => {
      await selectFilterOption("pool", "glmf");
      await waitFor(
        `${q('[data-chip="pool"]')}?.textContent.replace(/\\s+/g, "").includes("池：glmf") && ${q('[data-board-column="running"]')}?.dataset.count === "4"`,
        "池筛选结果",
      );
      return browser.evaluate(`({
      chip: ${q('[data-chip="pool"]')}?.textContent.trim() ?? null,
      running: ${q('[data-board-column="running"]')}?.dataset.count ?? null,
    })`);
    },
    { chip: "池：glmf", running: "4" },
  );

  await check(
    "列表：侧栏选择 wiki-forge 后视图标题显示项目名",
    "busy",
    "#/tasks",
    async () => {
      await waitFor(`${qa("[data-nav-project]")}.length === 6`, "项目导航加载");
      await clickExpr(`${qa("[data-nav-project]")}[0]`);
      await waitFor(
        `${q("[data-view-project]")}?.textContent.replace(/\\s+/g, "") === "wiki-forge"`,
        "项目视图标题更新",
      );
      return browser.evaluate(`${q("[data-view-project]")}?.textContent.trim() ?? null`);
    },
    "wiki-forge",
  );

  await check(
    "列表：empty 场景显示还没有任务和运行命令",
    "empty",
    "#/tasks/list",
    async () => {
      await waitFor(
        `${q("[data-task-list]")}?.textContent.replace(/\\s+/g, "").includes("还没有任务")`,
        "列表空态出现",
      );
      return browser.evaluate(`({
      empty: ${q("[data-task-list]")}?.textContent.replace(/\\s+/g, "").includes("还没有任务") ?? false,
      command: ${q("[data-task-list]")}?.textContent.replace(/\\s+/g, "").includes('fleetrun"任务"') ?? false,
    })`);
    },
    { empty: true, command: true },
  );

  await check(
    "列表：800 宽仅显示六列且页面无横向滚动",
    "busy",
    "#/tasks/list",
    async () => {
      await browser.setViewport(800, 900);
      await waitFor(`${qa("[data-task-row]")}.length === 50`, "窄屏列表数据加载");
      return browser.evaluate(`({
      headers: [...${q("[data-task-list]")}?.querySelectorAll("thead th") ?? []]
        .filter((header) => getComputedStyle(header).display !== "none")
        .map((header) => header.textContent.replace(/\\s+/g, "")),
      pageFits: document.documentElement.scrollWidth === document.documentElement.clientWidth,
    })`);
    },
    { headers: ["状态", "编号", "标题", "项目", "耗时", "开始时间"], pageFits: true },
    undefined,
    { width: 800, height: 900 },
  );

  // 详情：正文、时间线、属性和返回行为。
  await check(
    "详情：wr8v2k 面包屑、文档标题和宽屏属性栏正确",
    "busy",
    "#/tasks/wr8v2k",
    async () => {
      await waitFor(`!!${q("[data-properties-aside] [data-properties]")}`, "桌面属性栏出现");
      return browser.evaluate(`({
      crumb: ${q("[data-detail-crumb]")}?.textContent.trim() ?? null,
      documentTitle: document.title,
      asideVisible: (() => { const element = ${q("[data-properties-aside]")}; return !!element && getComputedStyle(element).display !== "none" && element.getBoundingClientRect().width > 0; })(),
    })`);
    },
    { crumb: "wr8v2k", documentTitle: "任务 wr8v2k · fleet studio", asideVisible: true },
  );

  await check(
    "详情：时间线 19 行且筛选数为全部 15、工具 8、异常 4",
    "busy",
    "#/tasks/wr8v2k",
    async () => {
      await waitFor(`${qa("[data-timeline-row]")}.length === 19`, "时间线行加载");
      return browser.evaluate(`({
      rows: ${qa("[data-timeline-row]")}.length,
      filters: [...${q("[data-timeline-header]")}?.querySelectorAll("[data-filter]") ?? []].map((item) => item.textContent.replace(/\\s+/g, "").trim()),
    })`);
    },
    { rows: 19, filters: ["全部15", "工具8", "异常4"] },
    (actual) => {
      const indexes = ["全部15", "工具8", "异常4"].map(
        (filter) => actual?.filters.indexOf(filter) ?? -1,
      );
      return (
        actual?.rows === 19 && indexes[0] >= 0 && indexes[0] < indexes[1] && indexes[1] < indexes[2]
      );
    },
  );
  await check(
    "详情：时间线工具筛选显示 12 行",
    "busy",
    "#/tasks/wr8v2k",
    async () => {
      await clickExpr(`${dataEl("data-filter", "tools", q("[data-timeline-header]"))}`);
      await waitFor(`${qa("[data-timeline-row]")}.length === 12`, "工具时间线过滤");
      return browser.evaluate(`${qa("[data-timeline-row]")}.length`);
    },
    12,
  );

  await check(
    "详情：时间线异常筛选显示 8 行",
    "busy",
    "#/tasks/wr8v2k",
    async () => {
      await clickExpr(`${dataEl("data-filter", "issues", q("[data-timeline-header]"))}`);
      await waitFor(`${qa("[data-timeline-row]")}.length === 8`, "异常时间线过滤");
      return browser.evaluate(`${qa("[data-timeline-row]")}.length`);
    },
    8,
  );

  await check(
    "详情：回报段落顺序正确且结论为通过",
    "busy",
    "#/tasks/wr8v2k",
    async () => {
      await waitFor(
        `!!${q("[data-report]")} && !!${q("[data-report] [data-verdict]")}`,
        "回报内容出现",
      );
      return browser.evaluate(`({
      sections: [...${qa("[data-report] dt")}].map((item) => item.textContent.trim()),
      verdict: ${q("[data-report] [data-verdict]")}?.textContent.trim() ?? null,
    })`);
    },
    { sections: ["SUMMARY", "FILES", "VERIFY", "VERDICT", "ISSUES"], verdict: "通过" },
  );

  await check(
    "详情：属性栏十项顺序符合规格",
    "busy",
    "#/tasks/wr8v2k",
    async () => {
      await waitFor(`${qa("[data-properties-aside] [data-prop]")}.length === 10`, "属性栏十项加载");
      return browser.evaluate(
        `[...${qa("[data-properties-aside] [data-prop]")}].map((item) => item.dataset.prop)`,
      );
    },
    ["status", "duration", "project", "role", "pool", "channel", "runs", "usage", "cwd", "created"],
  );

  await check(
    "详情：池属性含 dsf",
    "busy",
    "#/tasks/wr8v2k",
    async () => {
      await waitFor(`!!${q('[data-properties-aside] [data-prop="pool"]')}`, "池属性出现");
      return browser.evaluate(
        `${q('[data-properties-aside] [data-prop="pool"]')}?.textContent.replace(/\\s+/g, "").includes("dsf") ?? false`,
      );
    },
    true,
  );

  await check(
    "详情：已完成任务书默认折叠",
    "busy",
    "#/tasks/wr8v2k",
    async () => {
      await waitFor(`${q('[data-disclosure="task"]')}?.dataset.open === "false"`, "任务书折叠状态");
      return browser.evaluate(`({
      title: ${q('[data-disclosure="task"]')}?.textContent.replace(/\\s+/g, "").includes("任务书") ?? false,
      open: ${q('[data-disclosure="task"]')}?.dataset.open ?? null,
    })`);
    },
    { title: true, open: "false" },
  );

  await check(
    "详情：wk3m7p 标题和用量拆分组件正确",
    "busy",
    "#/tasks/wk3m7p",
    async () => {
      await waitFor(`!!${q("[data-detail-title]")}`, "任务标题出现");
      return browser.evaluate(`({
      title: ${q("[data-detail-title]")}?.textContent.trim() ?? null,
      breakdowns: ${qa("[data-detail] [data-usage-breakdown]")}.length,
    })`);
    },
    { title: "类目配置校验：数值与区间参数", breakdowns: 1 },
  );

  await check(
    "详情：从看板进入 wr8v2k 后返回任务看板",
    "busy",
    "#/tasks",
    async () => {
      await click('[data-task-card="wr8v2k"]');
      await waitFor(
        'location.hash === "#/tasks/wr8v2k" && !!document.querySelector("[data-detail-back]")',
        "卡片详情打开",
      );
      await click("[data-detail-back]");
      await waitFor('location.hash === "#/tasks"', "返回看板");
      return browser.evaluate("location.hash");
    },
    "#/tasks",
  );

  await check(
    "详情：直接打开后按 Esc 返回任务页",
    "busy",
    "#/tasks/wr8v2k",
    async () => {
      await browser.pressKey("Escape");
      await waitFor('location.hash === "#/tasks"', "Esc 返回任务页");
      return browser.evaluate("location.hash");
    },
    "#/tasks",
  );

  await check(
    "详情：不存在任务显示空态并可回到任务页",
    "busy",
    "#/tasks/nope123",
    async () => {
      await waitFor(
        `${q("[data-detail]")}?.textContent.replace(/\\s+/g, "").includes("没有这个任务")`,
        "不存在任务空态",
      );
      await clickExpr(
        `[...${q("[data-detail]")}.querySelectorAll("button")].find((button) => button.textContent.replace(/\\s+/g, "") === "回到任务")`,
      );
      await waitFor('location.hash === "#/tasks"', "回到任务列表");
      return browser.evaluate("location.hash");
    },
    "#/tasks",
  );

  await check(
    "详情：800 宽属性内嵌且页面无横向滚动",
    "busy",
    "#/tasks/wr8v2k",
    async () => {
      await browser.setViewport(800, 900);
      await waitFor(`!!${q("[data-detail] [data-properties]")}`, "窄屏内嵌属性出现");
      return browser.evaluate(`(() => {
      const properties = ${q("[data-detail] [data-properties]")};
      const style = properties ? getComputedStyle(properties) : null;
      return {
        aside: !!${q("[data-properties-aside]")},
        inline:
          !!properties &&
          properties.getClientRects().length > 0 &&
          style?.display !== "none" &&
          style?.visibility !== "hidden",
        pageFits: document.documentElement.scrollWidth === document.documentElement.clientWidth,
      };
    })()`);
    },
    { aside: false, inline: true, pageFits: true },
    undefined,
    { width: 800, height: 900 },
  );

  // 槽位：池顺序、启停、占用格和窄屏表格滚动。
  await check(
    "槽位：busy 有四池且标题为槽位",
    "busy",
    "#/slots",
    async () => {
      await waitFor(`${qa("[data-pool-row]")}.length === 4`, "四个池加载");
      return browser.evaluate(`({
      ids: [...${qa("[data-pool-row]")}].map((row) => row.dataset.poolRow),
      title: ${q("[data-view-bar] h1")}?.textContent.trim() ?? null,
    })`);
    },
    { ids: ["dsf", "glmf", "qwen27", "luna"], title: "槽位" },
  );

  await check(
    "槽位：首行上移和末行下移按钮隐藏",
    "busy",
    "#/slots",
    async () => {
      await waitFor(`${qa("[data-pool-row]")}.length === 4`, "池行加载");
      return browser.evaluate(`({
      firstUp: getComputedStyle(${q('[data-move-up="dsf"]')}).visibility,
      lastDown: getComputedStyle(${q('[data-move-down="luna"]')}).visibility,
    })`);
    },
    { firstUp: "hidden", lastDown: "hidden" },
  );

  await check(
    "槽位：dsf 下移后顺序与优先级变为 1、2、3、4",
    "busy",
    "#/slots",
    async () => {
      await click('[data-move-down="dsf"]');
      await waitFor(
        `${qa("[data-pool-row]")}[0]?.dataset.poolRow === "glmf" && ${qa("[data-pool-row]")}[1]?.dataset.poolRow === "dsf"`,
        "池顺序更新",
      );
      return browser.evaluate(`({
      ids: [...${qa("[data-pool-row]")}].map((row) => row.dataset.poolRow),
      priorities: [...${qa("[data-pool-row]")}].map((row) => row.cells[0]?.textContent.trim()),
    })`);
    },
    { ids: ["glmf", "dsf", "qwen27", "luna"], priorities: ["1", "2", "3", "4"] },
  );

  await check(
    "槽位：停用 glmf 前确认框说明还有 4 个在跑",
    "busy",
    "#/slots",
    async () => {
      await click('[data-pool-toggle="glmf"]');
      await waitFor(`!!${q("[data-disable-dialog]")}`, "停用确认框出现");
      return browser.evaluate(`({
      dialog: !!${q("[data-disable-dialog]")},
      message: ${q("[data-disable-dialog]")}?.textContent.replace(/\\s+/g, "").includes("还有4个在跑") ?? false,
    })`);
    },
    { dialog: true, message: true },
  );

  await check(
    "槽位：确认停用后关闭弹框并标记 glmf 停用",
    "busy",
    "#/slots",
    async () => {
      await click("[data-pool-toggle=glmf]");
      await waitFor(`!!${q("[data-disable-dialog]")}`, "停用确认框出现");
      await click("[data-confirm-disable]");
      await waitFor(
        `${q('[data-pool-row="glmf"]')}?.dataset.enabled === "false" && !${q("[data-disable-dialog]")}`,
        "池停用完成",
      );
      return browser.evaluate(`({
      dialog: !!${q("[data-disable-dialog]")},
      enabled: ${q('[data-pool-row="glmf"]')}?.dataset.enabled ?? null,
      disabledTag: !!${q('[data-pool-row="glmf"] [data-disabled-tag]')},
    })`);
    },
    { dialog: false, enabled: "false", disabledTag: true },
  );

  await check(
    "槽位：再次点击 glmf 开关直接启用",
    "busy",
    "#/slots",
    async () => {
      await click("[data-pool-toggle=glmf]");
      await waitFor(`!!${q("[data-disable-dialog]")}`, "首次停用确认框出现");
      await click("[data-confirm-disable]");
      await waitFor(`${q('[data-pool-row="glmf"]')}?.dataset.enabled === "false"`, "glmf 停用");
      await click("[data-pool-toggle=glmf]");
      await waitFor(`${q('[data-pool-row="glmf"]')}?.dataset.enabled === "true"`, "glmf 重新启用");
      return browser.evaluate(
        `({ enabled: ${q('[data-pool-row="glmf"]')}?.dataset.enabled ?? null, dialog: !!${q("[data-disable-dialog]")} })`,
      );
    },
    { enabled: "true", dialog: false },
  );

  await check(
    "槽位：dsf 占用 18 格且其中一格正在重试",
    "busy",
    "#/slots",
    async () => {
      await waitFor(`${qa('[data-slot-meter="dsf"] [data-slot]')}.length === 18`, "dsf 占用格加载");
      return browser.evaluate(`({
      slots: ${qa('[data-slot-meter="dsf"] [data-slot]')}.length,
      retrying: ${qa('[data-slot-meter="dsf"] [data-slot][data-retrying="true"]')}.length,
    })`);
    },
    { slots: 18, retrying: 1 },
  );

  await check(
    "槽位：首个 dsf 占用格按回车打开对应详情",
    "busy",
    "#/slots",
    async () => {
      const title = await browser.evaluate(`(() => {
      const cell = ${qa('[data-slot-meter="dsf"] [data-slot]')}[0];
      if (!cell) return null;
      cell.focus();
      return cell.getAttribute("aria-label")?.split("，")[1] ?? null;
    })()`);
      if (!title) throw new Error("首个占用格没有任务标题");
      await browser.pressKey("Enter");
      await waitFor(
        'location.hash.startsWith("#/tasks/") && !!document.querySelector("[data-detail-title]")',
        "占用格对应详情打开",
      );
      return {
        hash: await browser.evaluate("location.hash"),
        expectedTitle: title,
        detailTitle: await browser.evaluate(
          `${q("[data-detail-title]")}?.textContent.trim() ?? null`,
        ),
      };
    },
    null,
    (actual) =>
      actual?.hash.startsWith("#/tasks/") === true && actual.expectedTitle === actual.detailTitle,
  );

  await check(
    "槽位：公共排队 3 个并跳到带排队条件的列表",
    "busy",
    "#/slots",
    async () => {
      await waitFor(`!!${q("[data-shared-queue]")}`, "公共排队按钮出现");
      const text = await browser.evaluate(`${q("[data-shared-queue]")}?.textContent.trim() ?? ""`);
      await click("[data-shared-queue]");
      await waitFor(
        'location.hash === "#/tasks/list" && !!document.querySelector("[data-chip=\\"status\\"]")',
        "公共排队列表打开",
      );
      return {
        textIncludesThree: text.includes("3"),
        hash: await browser.evaluate("location.hash"),
        chip: await browser.evaluate(`${q('[data-chip="status"]')}?.textContent.trim() ?? null`),
      };
    },
    { textIncludesThree: true, hash: "#/tasks/list", chip: "状态：排队中" },
  );

  await check(
    "槽位：disabled 场景全部停用且四池均关闭",
    "disabled",
    "#/slots",
    async () => {
      await waitFor(
        `!!${q("[data-all-disabled]")} && ${qa("[data-pool-row]")}.length === 4`,
        "全部停用状态加载",
      );
      return browser.evaluate(`({
      notice: !!${q("[data-all-disabled]")},
      enabled: [...${qa("[data-pool-row]")}].map((row) => row.dataset.enabled),
    })`);
    },
    { notice: true, enabled: ["false", "false", "false", "false"] },
  );

  await check(
    "槽位：390 宽页面不溢出且表格容器内部横滚",
    "busy",
    "#/slots",
    async () => {
      await browser.setViewport(390, 844);
      await waitFor(`${qa("[data-pool-row]")}.length === 4`, "窄屏池表格加载");
      return browser.evaluate(`({
      pageFits: document.documentElement.scrollWidth === document.documentElement.clientWidth,
      tableScrolls: ${q("[data-slots-table] > div")}?.scrollWidth > ${q("[data-slots-table] > div")}?.clientWidth,
    })`);
    },
    { pageFits: true, tableScrolls: true },
    undefined,
    { width: 390, height: 844 },
  );

  // 总览：指标、分布、图例、空态与手机时间范围。
  await check(
    "总览：busy 槽位指标含 23 / 40 且标题正确",
    "busy",
    "#/overview",
    async () => {
      await waitFor(
        `${q('[data-stat="slots"]')}?.textContent.replace(/\\s+/g, "").includes("23/40")`,
        "槽位实时指标加载",
      );
      return browser.evaluate(`({
      slots: ${q('[data-stat="slots"]')}?.textContent.replace(/\\s+/g, " ").trim() ?? null,
      title: ${q("[data-view-bar] h1")}?.textContent.trim() ?? null,
    })`);
    },
    null,
    (actual) => actual?.slots.includes("23/40") && actual.title === "总览",
  );

  await check(
    "总览：实时和统计指标值字号均为 16px",
    "busy",
    "#/overview",
    async () => {
      await waitFor(
        `${q('[data-stat="tokens"]')}?.textContent.replace(/\\s+/g, "").match(/\\d/)`,
        "统计指标加载",
      );
      return browser.evaluate(`[...${qa("[data-stat]")}].map((stat) => {
      const value = stat.querySelector(".text-16");
      return value ? Number.parseFloat(getComputedStyle(value).fontSize) : null;
    })`);
    },
    [16, 16, 16, 16, 16, 16, 16, 16],
  );

  await check(
    "总览：点击排队指标跳到带排队中条件的列表",
    "busy",
    "#/overview",
    async () => {
      await click('[data-stat="queued"]');
      await waitFor(
        'location.hash === "#/tasks/list" && !!document.querySelector("[data-chip=\\"status\\"]")',
        "排队任务列表打开",
      );
      return browser.evaluate(
        `({ hash: location.hash, chip: ${q('[data-chip="status"]')}?.textContent.trim() ?? null })`,
      );
    },
    { hash: "#/tasks/list", chip: "状态：排队中" },
  );

  await check(
    "总览：点击重试指标跳到带重试中条件的列表",
    "busy",
    "#/overview",
    async () => {
      await click('[data-stat="retrying"]');
      await waitFor(
        'location.hash === "#/tasks/list" && !!document.querySelector("[data-chip=\\"status\\"]")',
        "重试任务列表打开",
      );
      return browser.evaluate(
        `({ hash: location.hash, chip: ${q('[data-chip="status"]')}?.textContent.trim() ?? null })`,
      );
    },
    { hash: "#/tasks/list", chip: "状态：重试中" },
  );

  await check(
    "总览：任务次数统计含 806",
    "busy",
    "#/overview",
    async () => {
      await waitFor(
        `${q('[data-stat="tasks"]')}?.textContent.replace(/\\s+/g, "").includes("806")`,
        "任务统计加载",
      );
      return browser.evaluate(
        `${q('[data-stat="tasks"]')}?.textContent.replace(/\\s+/g, " ").trim() ?? null`,
      );
    },
    "806",
    (actual) => actual?.includes("806") === true,
  );

  await check(
    "总览：选择今日后 token 指标不再显示今日补充",
    "busy",
    "#/overview",
    async () => {
      await click('[data-seg="overview-range:today"]');
      await waitFor(
        `!${q('[data-stat="tokens"]')}?.textContent.replace(/\\s+/g, "").includes("今日")`,
        "今日统计补充消失",
      );
      return browser.evaluate(
        `${q('[data-stat="tokens"]')}?.textContent.replace(/\\s+/g, "").includes("今日") ?? false`,
      );
    },
    false,
  );

  await check(
    "总览：token 分布切到项目且趋势图例数等于分布行数",
    "busy",
    "#/overview",
    async () => {
      await waitFor(
        `${qa('[data-section="token-share"] [data-share-row]')}.length > 0`,
        "token 分布加载",
      );
      await click('[data-section="token-share"] [data-seg="dimension:project"]');
      await waitFor(
        `${q('[data-section="token-share"] thead th')}?.textContent.replace(/\\s+/g, "") === "项目" && ${qa("[data-token-trend] [data-legend]")}.length > 0`,
        "项目维度分布及趋势加载",
      );
      return browser.evaluate(`({
      header: ${q('[data-section="token-share"] thead th')}?.textContent.trim() ?? null,
      legendCount: ${qa("[data-token-trend] [data-legend]")}.length,
      shareCount: ${qa('[data-section="token-share"] [data-share-row]')}.length,
    })`);
    },
    null,
    (actual) => actual?.header === "项目" && actual.legendCount === actual.shareCount,
  );

  await check(
    "总览：点击首条 token 分布进入列表并带入对应筛选",
    "busy",
    "#/overview",
    async () => {
      const activeDimension = await browser.evaluate(`(() => {
      const segments = ${qa('[data-section="token-share"] [data-seg^="dimension:"]')};
      const active = [...segments].find(
        (segment) =>
          segment.getAttribute("data-state") === "on" ||
          segment.getAttribute("aria-pressed") === "true",
      );
      return active?.getAttribute("data-seg").split(":")[1] ?? null;
    })()`);
      if (!activeDimension) throw new Error("token 分布没有选中的维度");
      await waitFor(
        `${qa('[data-section="token-share"] [data-share-row]')}.length > 0`,
        "token 分布行加载",
      );
      const rowKey = await browser.evaluate(
        `${qa('[data-section="token-share"] [data-share-row]')}[0]?.getAttribute("data-share-row") ?? null`,
      );
      if (!rowKey || rowKey === "__other") throw new Error("首条 token 分布没有可筛选项");
      await clickExpr(`${qa('[data-section="token-share"] [data-share-row]')}[0]`);
      await waitFor(
        `location.hash === "#/tasks/list" && [...${qa("[data-chip]")}].some((chip) => chip.getAttribute("data-chip") === ${JSON.stringify(activeDimension)})`,
        `${activeDimension} 维度筛选列表打开`,
      );
      return {
        dimension: activeDimension,
        rowKey,
        hash: await browser.evaluate("location.hash"),
        chip: await browser.evaluate(
          `[...${qa("[data-chip]")}].find((chip) => chip.getAttribute("data-chip") === ${JSON.stringify(activeDimension)})?.textContent.trim() ?? null`,
        ),
      };
    },
    {
      hash: "#/tasks/list",
      chip: "模型：deepseek-v4.1-flash",
    },
    (actual, expected) => actual?.hash === expected.hash && actual.chip === expected.chip,
  );

  await check(
    "总览：busy 分布不存在其他合并行",
    "busy",
    "#/overview",
    async () => {
      await waitFor(
        `${qa('[data-section="token-share"] [data-share-row]')}.length === 4`,
        "默认模型分布加载",
      );
      return browser.evaluate(`!!${q('[data-share-row="__other"]')}`);
    },
    false,
  );

  await check(
    "总览：关闭 O6 首个图例后 aria-pressed 为 false",
    "busy",
    "#/overview",
    async () => {
      await waitFor(`!!${q("[data-token-trend] [data-legend]")}`, "趋势图例加载");
      await clickExpr(`${q("[data-token-trend]")}?.querySelector("[data-legend]")`);
      await waitFor(
        `${q("[data-token-trend] [data-legend]")}?.getAttribute("aria-pressed") === "false"`,
        "图例关闭",
      );
      return browser.evaluate(
        `${q("[data-token-trend] [data-legend]")}?.getAttribute("aria-pressed") ?? null`,
      );
    },
    "false",
  );

  await check(
    "总览：empty 场景统计空态且四项实时值全为 0",
    "empty",
    "#/overview",
    async () => {
      await waitFor(`!!${q("[data-stats-empty]")}`, "统计空态出现");
      return browser.evaluate(`({
      empty: ${q("[data-stats-empty]")}?.textContent.replace(/\\s+/g, "").includes("这段时间没有任务") ?? false,
      values: ["slots", "running", "queued", "retrying"].map((key) =>
        [...document.querySelectorAll("[data-stat]")]
          .find((stat) => stat.dataset.stat === key)
          ?.querySelector(".text-16")?.textContent.trim() ?? null),
    })`);
    },
    { empty: true, values: ["0/40", "0", "0", "0"] },
  );

  await check(
    "总览：disabled 槽位指标含停用 4 个池",
    "disabled",
    "#/overview",
    async () => {
      await waitFor(
        `${q('[data-stat="slots"]')}?.textContent.replace(/\\s+/g, "").includes("停用4个池")`,
        "停用池实时指标出现",
      );
      return browser.evaluate(
        `${q('[data-stat="slots"]')}?.textContent.replace(/\\s+/g, "").includes("停用4个池") ?? false`,
      );
    },
    true,
  );

  await check(
    "总览：390 宽时间范围使用下拉框",
    "busy",
    "#/overview",
    async () => {
      await browser.setViewport(390, 844);
      await waitFor(`!!${q("[data-range-bar]")}`, "手机时间范围加载");
      return browser.evaluate(`({
      pageFits: document.documentElement.scrollWidth === document.documentElement.clientWidth,
      hasSelect: !!${q('[data-range-bar] [role="combobox"]')},
      hasSegments: ${qa("[data-range-bar] [data-seg]")}.length > 0,
    })`);
    },
    { pageFits: true, hasSelect: true, hasSegments: false },
    undefined,
    { width: 390, height: 844 },
  );
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.ok).length;
console.log(`\n交互检查：${results.length - failed}/${results.length} 通过`);
if (failed > 0) process.exitCode = 1;
