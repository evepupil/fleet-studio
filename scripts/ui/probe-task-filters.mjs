// 任务筛选回归：真实鼠标点击下拉选项，检查筛选结果和日期选择。
// 用法：pnpm --filter @fleet/web build 后 node scripts/ui/probe-task-filters.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { distUrl, launchBrowser } from "./cdp.mjs";
import { chooseSelectOption, clickElement } from "./interactions.mjs";

const browser = await launchBrowser(Number(process.env.CDP_PORT ?? 9343));
const results = [];
const q = (selector) => `document.querySelector(${JSON.stringify(selector)})`;
const shotDirectory = `.fleet/shots/task-filters-${process.env.FILTER_CHECK_LABEL ?? "current"}`;
let navigation = 0;

async function check(name, run) {
  try {
    await run();
    results.push({ name, ok: true });
    console.log(`通过：${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.error(`不通过：${name}；${error.message}`);
    await mkdir(shotDirectory, { recursive: true });
    await writeFile(`${shotDirectory}/failure-${results.length}.png`, await browser.screenshot());
  }
}

async function waitFor(expression) {
  assert.ok(await browser.waitFor(expression), `页面未达到预期：${expression}`);
}

async function openTasks(width = 1440) {
  await browser.setViewport(width, 900);
  navigation += 1;
  await browser.open(distUrl(process.cwd(), `?demo=busy&check=${navigation}`, "#/tasks"), 0);
  await waitFor('document.querySelectorAll("[data-task-row]").length === 30');
}

async function selectFilter(filter, label) {
  await chooseSelectOption(browser, `[data-filter="${filter}"]`, label);
}

async function assertColumn(column, text) {
  await waitFor(`(() => {
    const cells = [...document.querySelectorAll('[data-task-row] td:nth-child(${column})')];
    return cells.length > 0 && cells.every((cell) => cell.textContent.includes(${JSON.stringify(text)}));
  })()`);
}

async function openCustomRange(label = "自选") {
  await chooseSelectOption(browser, '[data-filter="range"] [role="combobox"]', label);
  await waitFor(`!!${q("[data-range-calendar]")}`);
}

async function clickDay(day) {
  await clickElement(
    browser,
    `[...document.querySelectorAll('[data-range-calendar] button[data-day]')]
      .find((button) => button.dataset.day === new Date(2026, 8, ${day}).toLocaleDateString())`,
  );
}

async function saveScreenshot(name) {
  await browser.waitFor(`(() => {
    const popup = ${q("[data-range-calendar]")};
    return !popup || getComputedStyle(popup).opacity === "1";
  })()`);
  await mkdir(shotDirectory, { recursive: true });
  await writeFile(`${shotDirectory}/${name}.png`, await browser.screenshot());
}

try {
  await browser.setTheme("light");
  await check("状态菜单可见，鼠标选择排队中后只显示 7 个排队任务", async () => {
    await openTasks();
    await selectFilter("status", "排队中");
    await waitFor('document.querySelectorAll("[data-task-row]").length === 7');
    await assertColumn(5, "排队");
  });
  await check("项目菜单可见，选择项目后结果与标签同步", async () => {
    await openTasks();
    await selectFilter("project", "wiki-forge");
    await assertColumn(2, "wiki-forge");
    await waitFor(`!!${q('[data-chip="project"]')}`);
  });
  await check("模型池菜单可见，选择池后仅显示该池任务", async () => {
    await openTasks();
    await clickElement(browser, q('[data-filter="pool"]'));
    await waitFor("!!document.querySelector('[role=\"listbox\"]')");
    const label = await browser.evaluate(
      '[...document.querySelectorAll(\'[role="option"]\')].find((item) => item.textContent.trim().startsWith("dsf"))?.textContent.trim()',
    );
    assert.ok(label, "找不到 dsf 模型池");
    await clickElement(
      browser,
      `[...document.querySelectorAll('[role="option"]')].find((item) => item.textContent.trim() === ${JSON.stringify(label)})`,
    );
    await assertColumn(4, "dsf");
    await waitFor(`!!${q('[data-chip="pool"]')}`);
  });
  await check("角色菜单可见，选择角色后仅显示该角色任务", async () => {
    await openTasks();
    await selectFilter("role", "评审");
    await assertColumn(3, "评审");
    await waitFor(`!!${q('[data-chip="role"]')}`);
  });
  await check("组合条件取交集，去掉单项与清除全部筛选都生效", async () => {
    await openTasks();
    await selectFilter("project", "wiki-forge");
    await selectFilter("role", "评审");
    await selectFilter("status", "排队中");
    await assertColumn(2, "wiki-forge");
    await assertColumn(3, "评审");
    await assertColumn(5, "排队");
    await saveScreenshot("combined-filters");
    await clickElement(browser, q('[data-chip="project"] button'));
    await waitFor(`!${q('[data-chip="project"]')}`);
    await waitFor(`${q('[data-filter="project"]')}?.textContent.includes("全部项目")`);
    await clickElement(browser, q("[data-clear-filters]"));
    await waitFor('document.querySelectorAll("[data-task-row]").length === 30');
    await waitFor(`!${q("[data-active-filters]")}`);
  });
  await check("状态菜单支持键盘选择和取消，关闭后焦点回到筛选框", async () => {
    await openTasks();
    await clickElement(browser, q('[data-filter="status"]'));
    await waitFor("!!document.querySelector('[role=\"option\"][data-highlighted]')");
    await browser.pressKey("ArrowDown");
    await waitFor('document.activeElement?.textContent.trim() === "排队中"');
    await browser.pressKey("Enter");
    await waitFor('document.querySelectorAll("[data-task-row]").length === 7');
    await clickElement(browser, q('[data-filter="status"]'));
    await browser.pressKey("Escape");
    await waitFor(`document.activeElement === ${q('[data-filter="status"]')}`);
    await waitFor(`${q('[data-filter="status"]')}?.textContent.includes("排队中")`);
  });
  await check("标题搜索和清空按钮使用真实输入后更新结果", async () => {
    await openTasks();
    await clickElement(browser, q('[data-filter="q"]'));
    await browser.rpc("Input.insertText", { text: "Fake 后端" });
    await waitFor('document.querySelectorAll("[data-task-row]").length === 1');
    await waitFor(`!!${q('[data-task-row="wx2j3k"]')}`);
    await clickElement(browser, q('[aria-label="清空搜索"]'));
    await waitFor('document.querySelectorAll("[data-task-row]").length === 30');
    await waitFor(`!${q('[data-chip="q"]')}`);
  });
  await check("时间预设菜单可用，选择今日后显示对应标签", async () => {
    await openTasks();
    await chooseSelectOption(browser, '[data-filter="range"] [role="combobox"]', "今日");
    await waitFor(`${q('[data-chip="range"]')}?.textContent.includes("今日")`);
  });
  await check("自选时间必须选完起止日期，再次选择同一档位可以修改日期", async () => {
    await openTasks();
    await selectFilter("status", "全部");
    await openCustomRange();
    await saveScreenshot("calendar-desktop");
    await clickDay(10);
    assert.equal(await browser.evaluate(`!!${q("[data-range-calendar]")}`), true);
    assert.equal(await browser.evaluate(`!!${q('[data-chip="range"]')}`), false);
    await clickDay(12);
    await waitFor(`!${q("[data-range-calendar]")}`);
    await waitFor(`${q('[data-chip="range"]')}?.textContent.includes("09-10 ~ 09-12")`);
    await waitFor('document.querySelectorAll("[data-task-row]").length > 0');
    await openCustomRange("09-10 ~ 09-12");
    await clickDay(15);
    await clickDay(15);
    await waitFor(`${q('[data-chip="range"]')}?.textContent.includes("09-15 ~ 09-15")`);
    await openCustomRange("09-15 ~ 09-15");
    await clickDay(12);
    await clickDay(10);
    await waitFor(`${q('[data-chip="range"]')}?.textContent.includes("09-10 ~ 09-12")`);
  });
  await check("窄屏日期选择只显示一个月，取消后保留原时间条件", async () => {
    await openTasks(800);
    await chooseSelectOption(browser, '[data-filter="range"] [role="combobox"]', "今日");
    await openCustomRange();
    assert.equal(
      await browser.evaluate(
        'document.querySelectorAll("[data-range-calendar] .rdp-month").length',
      ),
      1,
    );
    await saveScreenshot("calendar-800");
    await clickDay(10);
    await browser.pressKey("Escape");
    await waitFor(`!${q("[data-range-calendar]")}`);
    await waitFor(`${q('[data-chip="range"]')}?.textContent.includes("今日")`);
  });
  await check("深色窄屏下项目菜单可选择并能恢复全部项目", async () => {
    await openTasks(800);
    await browser.setTheme("dark");
    await selectFilter("project", "wiki-forge");
    await assertColumn(2, "wiki-forge");
    await selectFilter("project", "全部项目");
    await waitFor('document.querySelectorAll("[data-task-row]").length === 30');
    await waitFor(`!${q('[data-chip="project"]')}`);
    await browser.setTheme("light");
  });
  await check("总览共用的时间控件也能再次打开并修改自选日期", async () => {
    await browser.setViewport(1440, 900);
    await browser.open(distUrl(process.cwd(), "?demo=busy", "#/overview"), 0);
    await waitFor(`!!${q('[data-seg="overview-range:custom"]')}`);
    await clickElement(browser, q('[data-seg="overview-range:custom"]'));
    await waitFor(`!!${q("[data-range-calendar]")}`);
    await clickDay(10);
    await clickDay(12);
    await waitFor(`!${q("[data-range-calendar]")}`);
    await waitFor(
      `${q('[data-seg="overview-range:custom"]')}?.textContent.includes("09-10 ~ 09-12")`,
    );
    await clickElement(browser, q('[data-seg="overview-range:custom"]'));
    await waitFor(`!!${q("[data-range-calendar]")}`);
    await clickDay(15);
    await clickDay(16);
    await waitFor(
      `${q('[data-seg="overview-range:custom"]')}?.textContent.includes("09-15 ~ 09-16")`,
    );
  });
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.ok).length;
console.log(`任务筛选检查：${results.length - failed}/${results.length} 通过`);
if (failed > 0) process.exitCode = 1;
