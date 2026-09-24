// 验收工具：在无头浏览器里逐页真实点击关键交互并断言具体数值；每打开一页顺带收集运行时异常和 console.error
// （包括首屏渲染与浏览器不一致的告警），有就记一条失败。截图看不出交互对不对，这一步补上。
// 用法：先跑 local-copy.mjs，再 node .fleet/probe.mjs
//
// 每个项目要自己改下面的 run()。照每页页面层末尾的「交互检查表」写，一页两到七条。
// 断言写具体的值——「187」能验出公式算错，「非空」验不出。期望值能从数据层单测算出来的，一律从单测来。
import { DEVICES, discoverPages, launch } from "./cdp.mjs";

const results = [];
const pageErrors = [];

function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name} — ${typeof detail === "string" ? detail : JSON.stringify(detail)}`,
  );
}

// ====== 按项目改这一段 ======
// 可用的写法：
//   await openPage(b, "course/index-local.html");          // 打开一页并清空本页的报错记录
//   await step(b, "名字", `页面里跑的脚本，最后 return 一个值`, (v) => 断言);
//   errorCheck("页面名");                                   // 本页运行时错误与告警必须为 0
// 页面脚本里可用：$ $$ txt setVal clickEl byText sleep（见 cdp.mjs 的 PRELUDE）。
async function run(b) {
  // 默认：每页都能打开、有内容、没有运行时错误。换成项目的真实断言。
  for (const page of discoverPages()) {
    await openPage(b, page.path);
    await step(
      b,
      `${page.name}：页面已渲染`,
      `return document.querySelectorAll("main section, main > *").length;`,
      (v) => v > 0,
    );
    errorCheck(page.name);
  }

  // 例：筛选器 —— 选两个条件，结果数应该等于从单测算出的具体数字
  // await openPage(b, "results/index-local.html");
  // await step(b, "成绩：女子 30–39 岁", `
  //   clickEl($('[data-gender-filter="F"]')); clickEl($('[data-age-filter="30"]')); await sleep(350);
  //   return txt($('[data-results-count]'));`, (v) => v.includes("共 1,107 名"));
  //
  // 例：受控输入联动 —— 填身份证号，出生日期应自动变成对应的值
  // await step(b, "报名：身份证自动识别生日", `
  //   setVal($('#idNumber'), '110105199003071239'); await sleep(250); return $('#birthDate').value;`,
  //   (v) => v === "1990-03-07");
  //
  // 例：计算器分支 —— 结论文案应该是规格写好的那一句
  // await step(b, "赛道：5:55 从 F 区出发会被关门", `
  //   setVal($('#target'), '5:55:00'); setVal($('#corral'), 'F'); await sleep(250);
  //   return txt($('[data-cutoff-summary]'));`, (v) => v === "按这个配速会在 10 km 被关门（晚到 5:08）");
  //
  // 例：抽屉 —— 点第一行，抽屉标题与分段行数；按 Escape 能关
  // await step(b, "成绩：打开冠军的分段", `
  //   clickEl($$('[data-runner-row]')[0]); await sleep(700);
  //   const out = { title: txt($('#runner-title')), rows: $$('[data-split-row]').length };
  //   document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300);
  //   out.closed = !$('[data-runner-drawer]'); return out;`,
  //   (v) => v.title === "Evans Cheruiyot" && v.rows === 10 && v.closed);
  // errorCheck("成绩");
}
// ====== 改到这里 ======

async function openPage(b, path) {
  pageErrors.length = 0;
  await b.open(path, 3200);
}

async function step(b, name, body, assert) {
  try {
    const v = await b.evaluate(body);
    check(name, assert(v), v);
  } catch (e) {
    check(name, false, `异常：${e.message}`);
  }
}

function errorCheck(pageName) {
  const errs = [...pageErrors];
  check(
    `${pageName}：无运行时错误与告警`,
    errs.length === 0,
    errs.length === 0 ? "0 条" : errs.slice(0, 3).join(" | "),
  );
}

const b = await launch({
  port: Number(process.env.CDP_PORT ?? 9334),
  profile: "edge-cdp-probe",
  hideScrollbars: false,
});
b.onEvent((msg) => {
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    pageErrors.push(`异常 ${d.exception?.description?.split("\n")[0] ?? d.text}`);
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    pageErrors.push(
      `console.error ${msg.params.args
        .map((a) => a.value ?? a.description ?? "")
        .join(" ")
        .slice(0, 200)}`,
    );
  }
});
try {
  await b.setDevice(DEVICES.desktop);
  await run(b);
} catch (e) {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  b.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} 项通过`);
  if (passed < results.length) process.exitCode = 1;
}
