// 第二版看板交互检查：逐项对照 apps/web/design/ 四份页面检查表及任务详情迁移检查。
// 用法：pnpm --filter @fleet/web build 之后运行 node scripts/ui/probe.mjs
import { distUrl, launchBrowser } from "./cdp.mjs";
import { chooseSelectOption } from "./interactions.mjs";

const ROOT = process.cwd();
const browser = await launchBrowser(Number(process.env.CDP_PORT ?? 9342));
const results = [];
const q = (selector) => `document.querySelector(${JSON.stringify(selector)})`;
const qa = (selector) => `document.querySelectorAll(${JSON.stringify(selector)})`;

function printResult(name, actual, expected, ok, error = null) {
  results.push({ name, actual, expected, ok, error });
  if (ok) {
    console.log(`通过：${name}`);
  } else {
    const reason = error ?? `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`;
    console.log(`不通过：${name}；原因：${reason}`);
  }
}

async function check(
  name,
  getActual,
  expected,
  matches = (actual, wanted) => JSON.stringify(actual) === JSON.stringify(wanted),
) {
  try {
    const actual = await getActual();
    printResult(name, actual, expected, matches(actual, expected));
    return actual;
  } catch (error) {
    printResult(
      name,
      null,
      expected,
      false,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

async function openDemo(scenario, hash) {
  await browser.open(distUrl(ROOT, `?demo=${scenario}`, hash), 0);
  await browser.waitFor(
    'document.readyState === "complete" && !!document.querySelector("[data-page-header]")',
    3000,
  );
}

async function chooseRadixOption(selector, label) {
  await chooseSelectOption(browser, selector, label);
  return browser.waitFor(
    `${q(selector)}?.textContent.includes(${JSON.stringify(label)}) === true`,
    3000,
  );
}

async function setSearchValue(selector, value) {
  return browser.evaluate(`(() => {
    const input = ${q(selector)};
    if (!(input instanceof HTMLInputElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) return false;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
}

async function scrollTaskListToBottom() {
  return browser.evaluate(`(() => {
    const scroller = ${q("[data-task-scroll]")};
    if (!scroller) return false;
    scroller.scrollTop = scroller.scrollHeight;
    return true;
  })()`);
}

async function loadAllTaskPages() {
  for (let page = 0; page < 20; page += 1) {
    const state = await browser.evaluate(`({
      rows: ${qa("[data-task-row]")}.length,
      total: ${q("[data-task-total]")}?.textContent.trim() ?? null,
    })`);
    if (state.total !== null) return state;
    await scrollTaskListToBottom();
    const advanced = await browser.waitFor(
      `
      ${qa("[data-task-row]")}.length > ${state.rows} || !!${q("[data-task-total]")}
    `,
      3000,
    );
    if (!advanced) break;
  }
  return browser.evaluate(`({
    rows: ${qa("[data-task-row]")}.length,
    total: ${q("[data-task-total]")}?.textContent.trim() ?? null,
  })`);
}

try {
  await browser.setViewport(1440, 900);
  await browser.setTheme("light");

  // 骨架：导航顺序、切页、旧路由兼容、未知路由、折叠持久化与窄屏状态。
  await openDemo("busy", "#/overview");
  await check(
    "骨架：菜单有三项且顺序为总览、槽位、任务",
    () => browser.evaluate(`[...${qa("[data-nav-item]")}].map((item) => item.dataset.navItem)`),
    ["overview", "slots", "tasks"],
  );
  await check(
    "骨架：点击槽位导航后路由、高亮和标题正确",
    async () => {
      await browser.evaluate(`(() => { ${q('[data-nav-item="slots"]')}?.click(); })()`);
      await browser.waitFor(
        `location.hash === "#/slots" && ${q('[data-nav-item="slots"]')}?.getAttribute("aria-current") === "page" && ${q("[data-page-header] h1")}?.textContent.trim() === "槽位"`,
        3000,
      );
      return browser.evaluate(`({
        hash: location.hash,
        current: ${q('[data-nav-item="slots"]')}?.getAttribute("aria-current") ?? null,
        title: ${q("[data-page-header] h1")}?.textContent.trim() ?? null,
      })`);
    },
    { hash: "#/slots", current: "page", title: "槽位" },
  );
  await check(
    "骨架：旧任务详情路由重定向并高亮任务",
    async () => {
      await openDemo("busy", "#/w/wr8v2k");
      await browser.waitFor('location.hash === "#/tasks/wr8v2k"', 3000);
      return browser.evaluate(`({
        hash: location.hash,
        current: ${q('[data-nav-item="tasks"]')}?.getAttribute("aria-current") ?? null,
      })`);
    },
    { hash: "#/tasks/wr8v2k", current: "page" },
  );
  await check(
    "骨架：未知路由回到总览",
    async () => {
      await openDemo("busy", "#/nope");
      await browser.waitFor('location.hash === "#/overview"', 3000);
      return browser.evaluate("location.hash");
    },
    "#/overview",
  );
  await check("骨架：菜单可折叠、展开且刷新后保留最后状态", async () => {
    const states = [];
    for (const expected of ["true", "false"]) {
      await browser.evaluate(`(() => ${q("[data-nav-toggle]")}?.click())()`);
      await browser.waitFor(
        `${q("[data-nav]")}?.dataset.collapsed === ${JSON.stringify(expected)}`,
        3000,
      );
      states.push(await browser.evaluate(`${q("[data-nav]")}?.dataset.collapsed ?? null`));
    }
    await browser.reload();
    await browser.waitFor(`${q("[data-nav]")}?.dataset.collapsed === "false"`, 3000);
    states.push(await browser.evaluate(`${q("[data-nav]")}?.dataset.collapsed ?? null`));
    return states;
  }, ["true", "false", "false"]);
  await check(
    "骨架：800 宽菜单自动折叠且折叠按钮不可见",
    async () => {
      await browser.setViewport(800, 900);
      await browser.waitFor(`${q("[data-nav]")}?.dataset.collapsed === "true"`, 3000);
      return browser.evaluate(`({
        collapsed: ${q("[data-nav]")}?.dataset.collapsed ?? null,
        toggleHidden: getComputedStyle(${q("[data-nav-toggle]")}).display === "none",
      })`);
    },
    { collapsed: "true", toggleHidden: true },
  );
  await browser.setViewport(1440, 900);
  await check(
    "骨架：busy 进行中菜单徽标为 30",
    async () => {
      await openDemo("busy", "#/overview");
      await browser.waitFor(`${q("[data-nav-count]")}?.textContent.trim() === "30"`, 3000);
      return browser.evaluate(`${q("[data-nav-count]")}?.textContent.trim() ?? null`);
    },
    "30",
  );
  await check(
    "骨架：offline 场景显示断线提示",
    async () => {
      await openDemo("offline", "#/overview");
      await browser.waitFor(
        `${q('[data-banner="offline"]')}?.textContent.includes("连接已断开，正在重连")`,
        3000,
      );
      return browser.evaluate(`${q('[data-banner="offline"]')}?.textContent.trim() ?? null`);
    },
    "连接已断开，正在重连",
  );
  await check(
    "骨架：failure 场景显示配置错误提示",
    async () => {
      await openDemo("failure", "#/overview");
      await browser.waitFor(`!!${q('[data-banner="config"]')}`, 3000);
      return browser.evaluate(`!!${q('[data-banner="config"]')}`);
    },
    true,
  );

  // 总览：实时值、统计数字、跨页筛选、范围/维度/分布/图例和空态。
  await check(
    "总览：busy 实时五项及公共排队符合演示数据",
    async () => {
      await openDemo("busy", "#/overview");
      await browser.waitFor(
        `${q('[data-stat="slots"]')}?.getAttribute("aria-label") === "槽位占用 23 / 40，打开槽位页"`,
        3000,
      );
      return browser.evaluate(`({
        slots: ${q('[data-stat="slots"]')}?.getAttribute("aria-label") ?? null,
        running: ${q('[data-stat="running"]')}?.getAttribute("aria-label") ?? null,
        queued: ${q('[data-stat="queued"]')}?.getAttribute("aria-label") ?? null,
        retrying: ${q('[data-stat="retrying"]')}?.getAttribute("aria-label") ?? null,
        sharedQueued: ${q('[data-stat="queued"]')}?.textContent.includes("公共排队 3") ?? false,
      })`);
    },
    {
      slots: "槽位占用 23 / 40，打开槽位页",
      running: "工作中 23 个，查看任务",
      queued: "排队中 7 个，查看任务",
      retrying: "重试中 1 个，查看任务",
      sharedQueued: true,
    },
  );
  await check(
    "总览：busy 全部统计任务、token 和今日任务符合演示数据",
    async () => {
      await browser.waitFor(
        `${q('[data-stat="tokens"]')} .text-28 && ${q('[data-stat="tasks"]')} .text-28`,
        3000,
      );
      return browser.evaluate(`({
        tokens: ${q('[data-stat="tokens"]')}?.querySelector(".text-28")?.textContent.trim() ?? null,
        tasks: ${q('[data-stat="tasks"]')}?.querySelector(".text-28")?.textContent.trim() ?? null,
        todayTasks: ${q('[data-stat="tasks"]')}?.textContent.includes("今日 61") ?? false,
      })`);
    },
    { tokens: "463.2M", tasks: "806", todayTasks: true },
  );
  for (const [dimension, expectedCount] of [
    ["model", 4],
    ["channel", 4],
    ["project", 6],
    ["role", 6],
  ]) {
    await check(
      `总览：token 分布按${dimension}显示 ${expectedCount} 项`,
      async () => {
        await browser.waitFor(`${qa("[data-share-row]")}.length > 0`, 3000);
        await browser.evaluate(
          `(() => ${q(`[data-section="token-share"] [data-seg="dimension:${dimension}"]`)}?.click())()`,
        );
        await browser.waitFor(`${qa("[data-share-row]")}.length === ${expectedCount}`, 3000);
        return browser.evaluate(`({
          rows: ${qa("[data-share-row]")}.length,
          selected: ${q(`[data-section="token-share"] [data-seg="dimension:${dimension}"]`)}?.getAttribute("data-state") ?? null,
        })`);
      },
      { rows: expectedCount, selected: "on" },
    );
  }
  await check(
    "总览：点击排队统计卡跳到排队中任务",
    async () => {
      await openDemo("busy", "#/overview");
      await browser.evaluate(`(() => ${q('[data-stat="queued"]')}?.click())()`);
      await browser.waitFor(
        `location.hash === "#/tasks" && ${q('[data-filter="status"]')}?.textContent.trim() === "状态：排队中"`,
        3000,
      );
      return browser.evaluate(`({
        hash: location.hash,
        filter: ${q('[data-filter="status"]')}?.textContent.trim() ?? null,
      })`);
    },
    { hash: "#/tasks", filter: "状态：排队中" },
  );
  await check(
    "总览：点击重试统计卡跳到重试中任务",
    async () => {
      await openDemo("busy", "#/overview");
      await browser.evaluate(`(() => ${q('[data-stat="retrying"]')}?.click())()`);
      await browser.waitFor(
        `location.hash === "#/tasks" && ${q('[data-filter="status"]')}?.textContent.trim() === "状态：重试中"`,
        3000,
      );
      return browser.evaluate(`({
        hash: location.hash,
        filter: ${q('[data-filter="status"]')}?.textContent.trim() ?? null,
      })`);
    },
    { hash: "#/tasks", filter: "状态：重试中" },
  );
  await check(
    "总览：切到今日后统计卡不再出现今日补充行",
    async () => {
      await openDemo("busy", "#/overview");
      await browser.evaluate(`(() => ${q('[data-seg="overview-range:today"]')}?.click())()`);
      await browser.waitFor(`${q("[data-granularity]")}?.dataset.granularity === "hour"`, 3000);
      return browser.evaluate(`({
        hasToday: ${q('[data-stat="tokens"]')}?.textContent.includes("今日") ?? false,
        granularity: ${q("[data-granularity]")}?.dataset.granularity ?? null,
      })`);
    },
    { hasToday: false, granularity: "hour" },
  );
  await check(
    "总览：O4 切到项目后表头为项目且 O6 有 6 个图例",
    async () => {
      await openDemo("busy", "#/overview");
      await browser.waitFor(
        `${qa('[data-section="token-share"] [data-share-row]')}.length === 4`,
        3000,
      );
      await browser.evaluate(
        `(() => ${q('[data-section="token-share"] [data-seg="dimension:project"]')}?.click())()`,
      );
      await browser.waitFor(
        `${qa('[data-section="token-share"] [data-share-row]')}.length === 6`,
        3000,
      );
      return browser.evaluate(`({
        header: ${q('[data-section="token-share"] thead th')}?.textContent.trim() ?? null,
        legendCount: ${qa("[data-token-trend] [data-legend]")}.length,
      })`);
    },
    { header: "项目", legendCount: 6 },
  );
  await check(
    "总览：点击首条 token 分布跳转并带入项目筛选标签",
    async () => {
      const row = await browser.evaluate(`(() => {
        const first = ${q("[data-share-row]")};
        if (!first) return false;
        first.click();
        return true;
      })()`);
      if (!row)
        return { clicked: false, hash: await browser.evaluate("location.hash"), chip: false };
      await browser.waitFor(
        `location.hash === "#/tasks" && !!document.querySelector('[data-chip="project"]')`,
        3000,
      );
      return browser.evaluate(`({
        clicked: true,
        hash: location.hash,
        chip: !!${q('[data-chip="project"]')},
      })`);
    },
    { clicked: true, hash: "#/tasks", chip: true },
  );
  await check(
    "总览：分布不足 9 项时不出现「其他」行（busy 按项目 6 项）",
    async () => {
      await openDemo("busy", "#/overview");
      await browser.waitFor(
        `${qa('[data-section="token-share"] [data-share-row]')}.length === 4`,
        3000,
      );
      await browser.evaluate(
        `(() => ${q('[data-section="token-share"] [data-seg="dimension:project"]')}?.click())()`,
      );
      await browser.waitFor(
        `${qa('[data-section="token-share"] [data-share-row]')}.length === 6`,
        3000,
      );
      const found = await browser.evaluate(`(() => {
        const other = ${q('[data-share-row="__other"]')};
        if (!other) return false;
        other.click();
        return true;
      })()`);
      if (found) await browser.waitFor('location.hash === "#/overview"', 3000);
      return { found, hash: await browser.evaluate("location.hash") };
    },
    { found: false, hash: "#/overview" },
  );
  await check(
    "总览：点击 O6 首个图例后 aria-pressed 为 false",
    async () => {
      await openDemo("busy", "#/overview");
      await browser.waitFor(`${q("[data-token-trend] [data-legend]")}`, 3000);
      await browser.evaluate(`(() => ${q("[data-token-trend] [data-legend]")}?.click())()`);
      await browser.waitFor(
        `${q("[data-token-trend] [data-legend]")}?.getAttribute("aria-pressed") === "false"`,
        3000,
      );
      return browser.evaluate(
        `${q("[data-token-trend] [data-legend]")}?.getAttribute("aria-pressed") ?? null`,
      );
    },
    "false",
  );
  await check(
    "总览：empty 统计空态和四张实时卡数值符合预期",
    async () => {
      await openDemo("empty", "#/overview");
      await browser.waitFor(`!!${q("[data-stats-empty]")}`, 3000);
      return browser.evaluate(`({
        empty: ${q("[data-stats-empty]")}?.textContent.includes("这段时间没有任务") ?? false,
        slots: ${q('[data-stat="slots"]')}?.getAttribute("aria-label") ?? null,
        running: ${q('[data-stat="running"]')}?.getAttribute("aria-label") ?? null,
        queued: ${q('[data-stat="queued"]')}?.getAttribute("aria-label") ?? null,
        retrying: ${q('[data-stat="retrying"]')}?.getAttribute("aria-label") ?? null,
      })`);
    },
    {
      empty: true,
      slots: "槽位占用 0 / 40，打开槽位页",
      running: "工作中 0 个，查看任务",
      queued: "排队中 0 个，查看任务",
      retrying: "重试中 0 个，查看任务",
    },
  );
  await check(
    "总览：disabled 槽位卡显示 23 / 0 和停用 4 个池",
    async () => {
      await openDemo("disabled", "#/overview");
      return browser.evaluate(`({
        value: ${q('[data-stat="slots"]')}?.textContent.includes("23 / 0") ?? false,
        disabled: ${q('[data-stat="slots"]')}?.textContent.includes("停用 4 个池") ?? false,
      })`);
    },
    { value: true, disabled: true },
  );

  // 槽位：顺序、占用、交互、开关确认和全部停用场景。
  await check(
    "槽位：busy 四池顺序和每池在跑/容量/点名排队符合演示数据",
    async () => {
      await openDemo("busy", "#/slots");
      await browser.waitFor(`${qa("[data-pool-row]")}.length === 4`, 3000);
      return browser.evaluate(`({
        ids: [...${qa("[data-pool-row]")}].map((row) => row.dataset.poolRow),
        values: Object.fromEntries(["dsf", "glmf", "qwen27", "luna"].map((id) => {
          const row = [...document.querySelectorAll("[data-pool-row]")].find(
            (item) => item.dataset.poolRow === id,
          );
          return [id, {
            used: row?.children[3]?.textContent.trim() ?? null,
            queued: row?.children[4]?.textContent.trim() ?? null,
          }];
        })),
      })`);
    },
    {
      ids: ["dsf", "glmf", "qwen27", "luna"],
      values: {
        dsf: { used: "18 / 20", queued: "4" },
        glmf: { used: "4 / 7", queued: "—" },
        qwen27: { used: "0 / 5", queued: "—" },
        luna: { used: "1 / 8", queued: "—" },
      },
    },
  );
  await check(
    "槽位：首行上移和末行下移按钮保留 invisible 占位",
    () =>
      browser.evaluate(`({
      firstUp: ${q('[data-move-up="dsf"]')}?.classList.contains("invisible") ?? false,
      lastDown: ${q('[data-move-down="luna"]')}?.classList.contains("invisible") ?? false,
    })`),
    { firstUp: true, lastDown: true },
  );
  await check(
    "槽位：dsf 下移后池顺序和优先级同步改变",
    async () => {
      await browser.evaluate(`(() => ${q('[data-move-down="dsf"]')}?.click())()`);
      await browser.waitFor(
        `
        [...${qa("[data-pool-row]")}].map((row) => row.dataset.poolRow).join(",") === "glmf,dsf,qwen27,luna"
      `,
        3000,
      );
      return browser.evaluate(`({
        ids: [...${qa("[data-pool-row]")}].map((row) => row.dataset.poolRow),
        priorities: [...${qa("[data-pool-row]")}].map((row) => row.children[0]?.textContent.trim()),
      })`);
    },
    { ids: ["glmf", "dsf", "qwen27", "luna"], priorities: ["1", "2", "3", "4"] },
  );
  await check(
    "槽位：停用 glmf 前确认框说明还有 4 个在跑",
    async () => {
      await browser.evaluate(`(() => ${q('[data-pool-toggle="glmf"]')}?.click())()`);
      await browser.waitFor(`!!${q("[data-disable-dialog]")}`, 3000);
      return browser.evaluate(`({
        dialog: !!${q("[data-disable-dialog]")},
        hasRunningMessage: ${q("[data-disable-dialog]")}?.textContent.includes("还有 4 个在跑") ?? false,
      })`);
    },
    { dialog: true, hasRunningMessage: true },
  );
  await check(
    "槽位：确认停用后关闭确认框、行停用且出现标签",
    async () => {
      await browser.evaluate(`(() => ${q("[data-confirm-disable]")}?.click())()`);
      await browser.waitFor(
        `${q('[data-pool-row="glmf"]')}?.dataset.enabled === "false" && !${q("[data-disable-dialog]")}`,
        3000,
      );
      return browser.evaluate(`({
        dialogClosed: !${q("[data-disable-dialog]")},
        enabled: ${q('[data-pool-row="glmf"]')}?.dataset.enabled ?? null,
        disabledTag: !!${q('[data-pool-row="glmf"] [data-disabled-tag]')},
      })`);
    },
    { dialogClosed: true, enabled: "false", disabledTag: true },
  );
  await check(
    "槽位：重新点击 glmf 开关可直接启用而不弹确认框",
    async () => {
      await browser.evaluate(`(() => ${q('[data-pool-toggle="glmf"]')}?.click())()`);
      await browser.waitFor(`${q('[data-pool-row="glmf"]')}?.dataset.enabled === "true"`, 3000);
      return browser.evaluate(`({
        enabled: ${q('[data-pool-row="glmf"]')}?.dataset.enabled ?? null,
        dialog: !!${q("[data-disable-dialog]")},
      })`);
    },
    { enabled: "true", dialog: false },
  );
  await check(
    "槽位：dsf 槽位数 18 且其中重试格 1 个",
    () =>
      browser.evaluate(`({
      slots: ${qa('[data-slot-meter="dsf"] [data-slot]')}.length,
      retrying: ${qa('[data-slot-meter="dsf"] [data-slot][data-retrying="true"]')}.length,
    })`),
    { slots: 18, retrying: 1 },
  );
  await check(
    "槽位：聚焦首个 dsf 槽位按回车打开对应任务详情",
    async () => {
      const keySent = await browser.evaluate(`(() => {
        const slot = ${q('[data-slot-meter="dsf"] [data-slot]')};
        if (!slot) return null;
        slot.focus();
        return slot.getAttribute("aria-label")?.split("，")[1] ?? null;
      })()`);
      await browser.pressKey("Enter");
      await browser.waitFor(
        'location.hash.startsWith("#/tasks/") && !!document.querySelector("[data-detail-title]")',
        3000,
      );
      return browser.evaluate(`({
        slotTitle: ${JSON.stringify(keySent)},
        hash: location.hash,
        titleMatches: ${q("[data-detail-title]")}?.textContent.trim() === ${JSON.stringify(keySent)},
      })`);
    },
    { routeMatchesSlot: true, titleMatches: true },
    (actual) => actual?.titleMatches === true && /^#\/tasks\/[^/]+$/.test(actual.hash ?? ""),
  );
  await check(
    "槽位：重试格对应 wx2j3k 且属于 dsf",
    async () => {
      await openDemo("busy", "#/slots");
      const retryCells = await browser.evaluate(
        `${qa('[data-slot-meter="dsf"] [data-slot][data-retrying="true"]')}.length`,
      );
      await browser.evaluate(
        `(() => ${q('[data-slot-meter="dsf"] [data-slot][data-retrying="true"]')}?.click())()`,
      );
      await browser.waitFor('location.hash === "#/tasks/wx2j3k"', 3000);
      return {
        hash: await browser.evaluate("location.hash"),
        retryCells,
      };
    },
    { hash: "#/tasks/wx2j3k", retryCells: 1 },
  );
  await check(
    "槽位：busy 公共排队为 3",
    async () => {
      await openDemo("busy", "#/slots");
      return browser.evaluate(`${q("[data-shared-queue]")}?.getAttribute("aria-label") ?? null`);
    },
    "公共排队 3 个，查看任务",
  );
  await check(
    "槽位：disabled 显示全部停用、四池关闭且公共排队 5",
    async () => {
      await openDemo("disabled", "#/slots");
      await browser.waitFor(`!!${q("[data-all-disabled]")}`, 3000);
      return browser.evaluate(`({
        allDisabled: !!${q("[data-all-disabled]")},
        enabled: [...${qa("[data-pool-row]")}].map((row) => row.dataset.enabled),
        sharedQueued: ${q("[data-shared-queue]")}?.getAttribute("aria-label") ?? null,
      })`);
    },
    {
      allDisabled: true,
      enabled: ["false", "false", "false", "false"],
      sharedQueued: "公共排队 5 个，查看任务",
    },
  );

  // 任务：默认行数、Radix 状态选择、滚动分页、排序、原型 setter 搜索、清空、详情和空态。
  await check(
    "任务：busy 默认进行中列表为 30 行",
    async () => {
      await openDemo("busy", "#/tasks");
      await browser.waitFor(`${qa("[data-task-row]")}.length === 30`, 3000);
      return browser.evaluate(`${qa("[data-task-row]")}.length`);
    },
    30,
  );
  await check(
    "任务：Radix 状态下拉选全部后第一页为 50 行",
    async () => {
      const selected = await chooseRadixOption('[data-filter="status"]', "全部");
      await browser.waitFor(`${qa("[data-task-row]")}.length === 50`, 3000);
      return {
        selected,
        filter: await browser.evaluate(
          `${q('[data-filter="status"]')}?.textContent.trim() ?? null`,
        ),
        rows: await browser.evaluate(`${qa("[data-task-row]")}.length`),
      };
    },
    { selected: true, filter: "状态：全部", rows: 50 },
  );
  await check(
    "任务：滚动列表触发加载更多，行数超过 50",
    async () => {
      await scrollTaskListToBottom();
      await browser.waitFor(`${qa("[data-task-row]")}.length > 50`, 3000);
      return browser.evaluate(`${qa("[data-task-row]")}.length`);
    },
    50,
    (actual, expected) => typeof actual === "number" && actual > expected,
  );
  await check("任务：全部状态分页最终显示共 806 个任务", loadAllTaskPages, {
    rows: 806,
    total: "共 806 个",
  });
  await check(
    "任务：用原型 value setter 搜索 Fake 后端只命中 wx2j3k",
    async () => {
      const searchAssigned = await setSearchValue('[data-filter="q"]', "Fake 后端");
      await browser.waitFor(
        `${qa("[data-task-row]")}.length === 1 && !!${q('[data-chip="q"]')}`,
        3000,
      );
      const result = await browser.evaluate(`({
        ids: [...${qa("[data-task-row]")}].map((row) => row.dataset.taskRow),
        queryChip: !!${q('[data-chip="q"]')},
      })`);
      return { assigned: searchAssigned, ...result };
    },
    { assigned: true, ids: ["wx2j3k"], queryChip: true },
  );
  await check(
    "任务：清除筛选后标签消失且状态和默认行数恢复",
    async () => {
      await browser.evaluate(`(() => ${q("[data-clear-filters]")}?.click())()`);
      await browser.waitFor(
        `${qa("[data-task-row]")}.length === 30 && !${q("[data-active-filters]")}`,
        3000,
      );
      return browser.evaluate(`({
        chips: ${qa("[data-chip]")}.length,
        status: ${q('[data-filter="status"]')}?.textContent.trim() ?? null,
        rows: ${qa("[data-task-row]")}.length,
      })`);
    },
    { chips: 0, status: "状态：进行中", rows: 30 },
  );
  await check(
    "任务：按 token 降序排序且第一行用量不低于第二行",
    async () => {
      await browser.evaluate(`(() => ${q('[data-sort="tokens"] button')}?.click())()`);
      await browser.waitFor(
        `${q('[data-sort="tokens"]')}?.getAttribute("aria-sort") === "descending" && (() => {
          const rows = [...${qa("[data-task-row]")}];
          const numberOf = (value) => {
            const match = value.match(/([\\d,.]+)\\s*([KM]?)/);
            if (!match) return Number.NaN;
            const multiplier = match[2] === "M" ? 1000000 : match[2] === "K" ? 1000 : 1;
            return Number(match[1].replace(/,/g, "")) * multiplier;
          };
          const first = rows[0]?.querySelector("td:nth-child(6) button")?.textContent.trim() ?? "";
          const second = rows[1]?.querySelector("td:nth-child(6) button")?.textContent.trim() ?? "";
          return rows.length >= 2 && numberOf(first) >= numberOf(second);
        })()`,
        3000,
      );
      return browser.evaluate(`(() => {
        const rows = [...${qa("[data-task-row]")}];
        const numberOf = (value) => {
          const match = value.match(/([\\d,.]+)\\s*([KM]?)/);
          if (!match) return Number.NaN;
          const multiplier = match[2] === "M" ? 1000000 : match[2] === "K" ? 1000 : 1;
          return Number(match[1].replace(/,/g, "")) * multiplier;
        };
        const first = rows[0]?.querySelector("td:nth-child(6) button")?.textContent.trim() ?? "";
        const second = rows[1]?.querySelector("td:nth-child(6) button")?.textContent.trim() ?? "";
        return {
          ariaSort: ${q('[data-sort="tokens"]')}?.getAttribute("aria-sort") ?? null,
          first,
          second,
          sorted: rows.length >= 2 && numberOf(first) >= numberOf(second),
        };
      })()`);
    },
    { ariaSort: "descending", sorted: true },
    (actual, expected) =>
      actual?.ariaSort === expected.ariaSort && actual.sorted === expected.sorted,
  );
  await check(
    "任务：点击首行打开紧凑表格和详情并更新地址",
    async () => {
      await browser.waitFor(`${qa("[data-task-row]")}.length === 30`, 3000);
      const id = await browser.evaluate(`(() => {
        const row = ${q("[data-task-row]")};
        if (!row) return null;
        const value = row.dataset.taskRow;
        row.click();
        return value;
      })()`);
      if (id) {
        await browser.waitFor(
          `location.hash === "#/tasks/${id}" && ${q("[data-task-table]")}?.dataset.compact === "true" && !!${q("[data-detail]")}`,
          3000,
        );
      }
      return browser.evaluate(`({
        id: ${JSON.stringify(id)},
        hash: location.hash,
        compact: ${q("[data-task-table]")}?.dataset.compact ?? null,
        detail: !!${q("[data-detail]")},
      })`);
    },
    null,
    (actual) =>
      actual?.id !== null &&
      actual?.hash === `#/tasks/${actual?.id}` &&
      actual?.compact === "true" &&
      actual?.detail === true,
  );
  await check(
    "任务：关闭详情返回任务列表并展开表格",
    async () => {
      await browser.evaluate(`(() => ${q("[data-detail-close]")}?.click())()`);
      await browser.waitFor(
        `location.hash === "#/tasks" && ${q("[data-task-table]")}?.dataset.compact === "false"`,
        3000,
      );
      return browser.evaluate(`({
        hash: location.hash,
        compact: ${q("[data-task-table]")}?.dataset.compact ?? null,
      })`);
    },
    { hash: "#/tasks", compact: "false" },
  );
  await check(
    "任务：打开 wr8v2k 时间线为 19 行（含 4 条运行分隔），筛选计数不含分隔为 15/8/4",
    async () => {
      await openDemo("busy", "#/tasks/wr8v2k");
      await browser.waitFor(`${qa("[data-timeline-row]")}.length === 19`, 3000);
      return browser.evaluate(`({
        rows: ${qa("[data-timeline-row]")}.length,
        all: ${q('[data-timeline-header] [data-filter="all"]')}?.textContent.replace(/\\s+/g, "").trim() ?? null,
        tools: ${q('[data-timeline-header] [data-filter="tools"]')}?.textContent.replace(/\\s+/g, "").trim() ?? null,
        issues: ${q('[data-timeline-header] [data-filter="issues"]')}?.textContent.replace(/\\s+/g, "").trim() ?? null,
      })`);
    },
    { rows: 19, all: "全部15", tools: "工具8", issues: "异常4" },
  );
  await check(
    "任务：时间线工具筛选保留 12 行",
    async () => {
      await browser.evaluate(
        `(() => ${q('[data-timeline-header] [data-filter="tools"]')}?.click())()`,
      );
      await browser.waitFor(`${qa("[data-timeline-row]")}.length === 12`, 3000);
      return browser.evaluate(`${qa("[data-timeline-row]")}.length`);
    },
    12,
  );
  await check(
    "任务：时间线异常筛选保留 8 行",
    async () => {
      await browser.evaluate(
        `(() => ${q('[data-timeline-header] [data-filter="issues"]')}?.click())()`,
      );
      await browser.waitFor(`${qa("[data-timeline-row]")}.length === 8`, 3000);
      return browser.evaluate(`${qa("[data-timeline-row]")}.length`);
    },
    8,
  );
  await check(
    "任务：wr8v2k 回报段落顺序和 verdict 均为通过",
    () =>
      browser.evaluate(`({
      sections: [...${qa("[data-report] dt")}].map((item) => item.textContent.trim()),
      verdict: ${q("[data-report] [data-verdict]")}?.textContent.trim() ?? null,
    })`),
    { sections: ["SUMMARY", "FILES", "VERIFY", "VERDICT", "ISSUES"], verdict: "通过" },
  );
  await check(
    "任务：详情复制编号文字等于路由编号",
    () =>
      browser.evaluate(`({
      id: location.hash.split("/").at(-1),
      copyText: ${q("[data-copy-id]")}?.textContent.trim() ?? null,
    })`),
    { id: "wr8v2k", copyText: "wr8v2k" },
  );
  await check(
    "任务：800 宽详情隐藏表格且返回按钮可见",
    async () => {
      await browser.setViewport(800, 900);
      return browser.evaluate(`({
        tableHidden: getComputedStyle(${q("[data-task-table]")}).display === "none",
        backVisible: getComputedStyle(${q("[data-detail-back]")}).display !== "none",
      })`);
    },
    { tableHidden: true, backVisible: true },
  );
  await check(
    "任务：wk3m7p 详情标题正确且保留用量拆分组件",
    async () => {
      await browser.setViewport(1440, 900);
      await openDemo("busy", "#/tasks/wk3m7p");
      await browser.waitFor(`!!${q("[data-detail-title]")}`, 3000);
      return browser.evaluate(`({
        title: ${q("[data-detail-title]")}?.textContent.trim() ?? null,
        usageBreakdowns: ${qa("[data-detail] [data-usage-breakdown]")}.length,
      })`);
    },
    { title: "类目配置校验：数值与区间参数", usageBreakdowns: 1 },
  );
  await check(
    "任务：empty 场景任务列表为 0 行",
    async () => {
      await openDemo("empty", "#/tasks");
      await browser.waitFor(
        `${q("[data-task-table]")}?.textContent.includes("没有进行中的任务")`,
        3000,
      );
      return browser.evaluate(`({
        rows: ${qa("[data-task-row]")}.length,
        empty: ${q("[data-task-table]")}?.textContent.includes("没有进行中的任务") ?? false,
      })`);
    },
    { rows: 0, empty: true },
  );
} catch (error) {
  printResult(
    "探针执行",
    null,
    "所有检查继续并打印结果",
    false,
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.ok).length;
console.log(`\n交互检查：${results.length - failed}/${results.length} 通过`);
if (failed > 0) process.exitCode = 1;
