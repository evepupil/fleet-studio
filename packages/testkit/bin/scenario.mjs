/**
 * fake-pi.mjs / fake-opencode.mjs 共用的小工具：从任务文字里读剧本标记、算相邻事件的
 * 延时、等 stdin 读完、写轨迹文件。两个假苦工的“剧本怎么触发”必须完全一致，抽成一份，
 * 改标记格式时不会漏改一处。规格见 docs/模块设计/测试支撑-假苦工.md 第 3 节。
 *
 * 纯 JavaScript、只用 Node 内置模块，Node 24 直接跑，不经过任何编译。
 */

import { appendFileSync, readFileSync } from "node:fs";

/** 任务文字里 [[key:value]] 形式的标记，例如 [[scenario:success]] [[delay:200]]。 */
const MARKER_PATTERN = /\[\[(\w+):([^\]]+)\]\]/g;

/**
 * success 剧本没有自定义回报文字时，最后一条模型文字固定用这份——`SELF_REPORT: pass`
 * 让 @fleet/core 的 parseReport 能读出 verdict "pass"，集成测试可以直接断言"回报结论为通过"，
 * 不用每次都自己拼一份合法的回报格式。
 */
export const DEFAULT_SUCCESS_REPORT = [
  "SUMMARY: 假苦工按剧本完成任务",
  "FILES:",
  "- （无改动）",
  "VERIFY: 假苦工不执行真实命令",
  "SELF_REPORT: pass",
  "BLOCKED: 无",
].join("\n");

/**
 * 从任务文字里解析出这次运行要走哪个剧本、用什么参数。
 * 每个标记的含义和缺省值见模块设计文档第 3.1 节。`text` 是去掉所有 [[key:value]] 标记之后
 * 剩下的文字（`scenarioPrompt` 的 `text` 选项传了什么，这里就剩下什么）：success 剧本用它
 * 覆盖默认的固定回报，非空就用调用方传入的，空字符串表示没传、维持原有的固定回报。
 * @param {string} taskText
 * @returns {{ scenario: string, delayMs: number, tools: number, exitCode: number, text: string }}
 */
export function parseScenario(taskText) {
  const marks = {};
  for (const match of taskText.matchAll(MARKER_PATTERN)) {
    marks[match[1]] = match[2];
  }
  return {
    scenario: marks.scenario ?? "success",
    delayMs: toInt(marks.delay, 20),
    tools: toInt(marks.tools, 1),
    exitCode: toInt(marks.exit, 3),
    text: taskText.replace(MARKER_PATTERN, "").trim(),
  };
}

function toInt(raw, fallback) {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** @param {number} ms */
export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 造一个“逐行写 stdout、相邻两行之间等 delayMs”的发射函数：
 * 第一行立刻写，后面每一行都先等一等再写，符合模块设计里“相邻两个输出事件之间的间隔”的定义。
 * @param {number} delayMs
 */
export function makeEmitter(delayMs) {
  let first = true;
  return async function emit(event) {
    if (!first) {
      await sleep(delayMs);
    }
    first = false;
    process.stdout.write(`${JSON.stringify(event)}\n`);
  };
}

/**
 * 让事件循环永远醒着，但几乎不占资源——hang / spawn-child-hang 剧本靠这个“卡住不退出”。
 * setInterval 的最大合法延时约 24.8 天，足够撑过任何测试的超时窗口。
 */
export function keepAliveForever() {
  setInterval(() => {}, 0x7fffffff);
}

/**
 * 真实 pi / opencode 启动后，只要 stdin 不是 TTY 就会一直读到 EOF 才继续往下走
 * （调研报告 pi 第 6 节 / opencode 第 6.1 节）。假苦工必须原样模仿：
 * 守护进程如果忘了把 stdin 设成 'ignore'，测试要能借这个行为测出“卡住了”。
 */
export function waitForStdinEnd() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY === true) {
      resolve();
      return;
    }
    process.stdin.on("end", resolve);
    process.stdin.resume();
  });
}

/** 文件读不到就当空字符串——附件路径不对不该让假苦工自己崩掉，这不是本包要测的行为。 */
export function readTextFileSafe(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function traceFile() {
  const file = process.env.FLEET_FAKE_TRACE;
  return typeof file === "string" && file.length > 0 ? file : null;
}

/**
 * 每个假苦工进程自己独一份的轨迹编号：进程号会被 Windows 重复分配（实测：8 路并行起
 * 300 个短命进程，26 次拿到用过的号；全仓并行跑时机器每秒起几十个进程，同一个号在一两秒
 * 内被后一个苦工拿到并不罕见）。这个编号只在当前进程的一整个生命周期里固定不变，
 * start、end 两行都带上它，读轨迹的一方（maxConcurrency）就能把「同一个进程号先后
 * 属于两个不同进程」这种情况分清楚，不会把前一个进程的结束时间和后一个的搭在一起。
 * 用 pid + 启动毫秒 + 随机后缀拼，randomSuffix 定义在下面，函数声明会被提升，这里能直接用。
 */
const TRACE_ID = `${process.pid}-${Date.now()}-${randomSuffix()}`;

function appendTraceLine(record) {
  const file = traceFile();
  if (file === null) {
    return;
  }
  try {
    appendFileSync(file, `${JSON.stringify(record)}\n`);
  } catch {
    // 轨迹文件写不进去（目录不存在之类）不该反过来让假苦工本身崩掉；
    // 这种环境问题会在读轨迹的测试断言里自然暴露。
  }
}

/**
 * 进程刚起来时就写一行“start”轨迹——这时 OS 进程已经存在，
 * 调度容量的角度看它已经算“在跑”了，不用等到读完 stdin 或跑完剧本。
 * @param {"pi" | "opencode"} runtime
 * @param {readonly string[]} args
 */
export function traceStart(runtime, args) {
  appendTraceLine({
    event: "start",
    pid: process.pid,
    at: Date.now(),
    runtime,
    args,
    cwd: process.cwd(),
    traceId: TRACE_ID,
  });
}

/**
 * 正常收尾时写一行“end”轨迹。被外部强杀的进程（hang / retry-storm / spawn-child-hang）
 * 走不到这一行，这是预期行为，不是遗漏。
 * @param {"pi" | "opencode"} runtime
 */
export function traceEnd(runtime) {
  appendTraceLine({
    event: "end",
    pid: process.pid,
    at: Date.now(),
    runtime,
    cwd: process.cwd(),
    traceId: TRACE_ID,
  });
}

/** 生成一段短随机后缀，给假会话 id 用，避免多次运行之间互相撞车。 */
export function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}
