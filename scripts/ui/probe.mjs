// 看板交互检查：对照 apps/web/design/工作区.md 文末「交互检查会找什么」逐条断言具体的值。
// 用法：pnpm --filter @fleet/web build 之后运行 node scripts/ui/probe.mjs
import { distUrl, launchBrowser, sleep } from "./cdp.mjs";

const ROOT = process.cwd();
const browser = await launchBrowser(Number(process.env.CDP_PORT ?? 9342));
const results = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ name, ok, actual, expected });
  console.log(
    `${ok ? "通过" : "失败"}  ${name}${ok ? "" : `：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`,
  );
}

const q = (selector) => `document.querySelector(${JSON.stringify(selector)})`;
const qa = (selector) => `document.querySelectorAll(${JSON.stringify(selector)})`;
const text = (selector) => browser.evaluate(`(${q(selector)}?.textContent ?? "").trim()`);
const count = (selector) => browser.evaluate(`${qa(selector)}.length`);

try {
  await browser.setViewport(1440, 900);
  await browser.setTheme("dark");

  // 1～4：容量数字与格子
  await browser.open(distUrl(ROOT, "?demo=busy"), 1500);
  check("1 dsf 占用", await text('[data-pool="dsf"] [data-pool-used]'), "18 / 20");
  check("2 glm 占用", await text('[data-pool="glm"] [data-pool-used]'), "3 / 8");
  check("3a dsf 占用格", await count('[data-pool="dsf"] [data-slot]'), 18);
  check("3b dsf 空格", await count('[data-pool="dsf"] [data-slot-empty]'), 2);
  check("4 dsf 重试格", await count('[data-pool="dsf"] [data-slot][data-retrying="true"]'), 1);

  // 5：键盘在格子之间移动并出提示卡
  const secondTitle = await browser.evaluate(`(() => {
    const slots = ${qa('[data-pool="dsf"] [data-slot]')};
    slots[0].focus();
    slots[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    return slots[1].getAttribute("data-worker-id");
  })()`);
  await sleep(400);
  const focused = await browser.evaluate(
    "document.activeElement?.getAttribute('data-worker-id') ?? null",
  );
  check("5a 右方向键移到第二格", focused, secondTitle);
  check("5b 聚焦出提示卡", (await count("[data-slot-tip]")) > 0, true);

  // 6：点击格子打开详情
  await browser.evaluate(`${q('[data-slot][data-worker-id="wk3m7p"]')}.click()`);
  await sleep(600);
  check("6a 详情标题", await text("[data-detail-title]"), "类目配置校验：数值与区间参数");
  check("6b 地址栏", await browser.evaluate("location.hash"), "#/w/wk3m7p");

  // 7：展开 CloudMind 组
  await browser.evaluate(
    `(() => { const b = ${qa("[data-list-toolbar] [data-filter]")}; for (const x of b) if (x.getAttribute("data-filter") === "all") x.click(); })()`,
  );
  await sleep(300);
  const cloudExpanded = await browser.evaluate(
    `${q('[data-project="c:\\\\code\\\\cloudmind"] [data-project-toggle]')}?.getAttribute("aria-expanded")`,
  );
  if (cloudExpanded !== "true") {
    await browser.evaluate(
      `${q('[data-project="c:\\\\code\\\\cloudmind"] [data-project-toggle]')}.click()`,
    );
    await sleep(300);
  }
  check(
    "7 CloudMind 组的苦工行",
    await count('[data-project="c:\\\\code\\\\cloudmind"] [data-worker-row]'),
    8,
  );

  // 8：时间线行数与筛选
  await browser.open(distUrl(ROOT, "?demo=busy", "#/w/wr8v2k"), 1500);
  check("8a 时间线全部", await count("[data-timeline-row]"), 19);
  await browser.evaluate(`${q('[data-timeline-header] [data-filter="tools"]')}.click()`);
  await sleep(300);
  check("8b 时间线工具", await count("[data-timeline-row]"), 12);
  await browser.evaluate(`${q('[data-timeline-header] [data-filter="issues"]')}.click()`);
  await sleep(300);
  check("8c 时间线异常", await count("[data-timeline-row]"), 8);

  // 9：回报段落与结论
  const keys = await browser.evaluate(
    `[...${qa("[data-report] dt")}].map((d) => d.textContent.trim())`,
  );
  check("9a 回报段名", keys, ["SUMMARY", "FILES", "VERIFY", "VERDICT", "ISSUES"]);
  check("9b 回报结论", (await text("[data-report]")).includes("通过"), true);

  // 10～12：其他场景
  await browser.open(distUrl(ROOT, "?demo=offline"), 1500);
  check("10 断线提示条", await text('[data-banner="offline"]'), "连接已断开，正在重连");
  await browser.open(distUrl(ROOT, "?demo=empty"), 1500);
  check("11 空态", (await text("[data-empty]")).includes("还没有苦工"), true);
  await browser.open(distUrl(ROOT, "?demo=failure"), 1500);
  check("12a 配置错误提示条", (await count('[data-banner="config"]')) > 0, true);
  check(
    "12b 故障健康行",
    (await text('[data-pool="dsf"] [data-pool-health]')).includes("失败 9"),
    true,
  );

  // 13：今日用量拆分成输入、输出、缓存；两个池和苦工详情共用同一个组件
  await browser.open(distUrl(ROOT, "?demo=busy", "#/w/wk3m7p"), 1500);
  const oneSpace = (value) => value.replace(/s+/g, " ");
  check(
    "13a dsf 今日用量拆分",
    oneSpace(await text('[data-pool="dsf"] [data-pool-usage-breakdown]')),
    "输入 1.1M · 输出 480.4K · 缓存 672.6K",
  );
  check(
    "13b glm 今日用量拆分",
    oneSpace(await text('[data-pool="glm"] [data-pool-usage-breakdown]')),
    "输入 93.6K · 输出 40.1K · 缓存 56.2K",
  );
  check("13c 拆分组件共用", await count("[data-usage-breakdown]"), 3);
} catch (error) {
  console.error("探针执行出错：", error.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n交互检查：${results.length - failed}/${results.length} 通过`);
if (failed > 0) process.exitCode = 1;
