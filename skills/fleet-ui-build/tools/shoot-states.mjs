// 验收工具：交互状态截图。静态截图只拍得到页面初始的样子；报错提示、提交成功、详情抽屉、手机菜单、
// 筛选后的空结果都要先点一下才会出现。这个工具按脚本把这些状态点出来，再按元素或视口截图。
// 用法：先跑 local-copy.mjs，再 node .fleet/shoot-states.mjs [tag]
// 输出到 .fleet/shots/<tag>-<状态名>.png。
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEVICES, discoverPages, launch, ROOT } from "./cdp.mjs";

const SHOTS = join(ROOT, ".fleet", "shots");
const TAG = process.argv[2] ?? "state";
mkdirSync(SHOTS, { recursive: true });

async function shotViewport(b, name) {
  const s = await b.rpc("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(SHOTS, `${TAG}-${name}.png`), Buffer.from(s.data, "base64"));
  console.log(`saved ${TAG}-${name}.png`);
}

/** 只截某个元素（按它在整页里的位置裁切），适合表单卡、某个区块 */
// biome-ignore lint/correctness/noUnusedVariables: 现成的截图工具，按项目改写 run() 时取用
async function shotElement(b, selector, name) {
  const box =
    await b.evaluate(`const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error("没找到 ${selector}");
    const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };`);
  const s = await b.rpc("Page.captureScreenshot", {
    format: "png",
    clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 },
    captureBeyondViewport: true,
  });
  writeFileSync(join(SHOTS, `${TAG}-${name}.png`), Buffer.from(s.data, "base64"));
  console.log(`saved ${TAG}-${name}.png (${Math.round(box.w)}x${Math.round(box.h)})`);
}

// ====== 按项目改这一段 ======
// 一般五到十张：表单报错态、表单成功态、抽屉或弹层（桌面与手机各一张）、手机菜单、带筛选的空结果、计算器的越界结果。
// 写法：b.setDevice(DEVICES.mobile / DEVICES.desktop) → b.open(路径) → b.evaluate(点出状态的脚本) → shotElement / shotViewport。
async function run(b) {
  // 默认：手机上打开首页，点开菜单（找 aria-label 含「菜单」的按钮）后截视口。换成项目的真实状态。
  const home = discoverPages().find((p) => p.name === "home");
  if (home) {
    await b.setDevice(DEVICES.mobile);
    await b.open(home.path);
    await b.evaluate(
      `const btn = $$('button[aria-label]').find((x) => x.getAttribute('aria-label').includes('菜单')); if (btn) { clickEl(btn); await sleep(400); }`,
    );
    await shotViewport(b, "home-menu-mobile");
  }

  // 例：表单第 2 步报错态 —— 选项目、下一步、空表下一步
  // await b.setDevice(DEVICES.desktop);
  // await b.open("register/index-local.html");
  // await b.evaluate(`$('#event-full').click(); await sleep(150); clickEl(byText('#form button', '下一步')); await sleep(350);
  //   clickEl(byText('#form button', '下一步')); await sleep(300);`);
  // await shotElement(b, "#form", "register-step2-errors");
  //
  // 例：详情抽屉（桌面截视口，手机上是底部弹层）
  // await b.open("results/index-local.html");
  // await b.evaluate(`clickEl($$('[data-runner-row]')[0]); await sleep(800);`);
  // await shotViewport(b, "results-drawer-desktop");
}
// ====== 改到这里 ======

const b = await launch({ port: Number(process.env.CDP_PORT ?? 9335), profile: "edge-cdp-states" });
try {
  await run(b);
} catch (e) {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  b.close();
}
