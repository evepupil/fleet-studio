#!/usr/bin/env node
/**
 * 假 opencode：按任务文字里的剧本标记，吐出和真实 `opencode run --format json` 一模一样
 * 格式的事件流、退出码和 stderr。给集成测试和看板演示用，不依赖真实模型。
 *
 * 事件字段照 docs/调研/opencode-运行时.md 第 2 节和
 * packages/core/test/fixtures/opencode/ 下的真实抓包逐字段模仿；最终会被
 * packages/core/src/runtimes/opencode/reducer.ts 解析，字段名和形状必须对得上那边实际
 * 读取的部分。规格见 docs/模块设计/测试支撑-假苦工.md。
 *
 * 纯 JavaScript、只用 Node 内置模块，Node 24 直接跑，不经过任何编译。
 */

import { spawn } from "node:child_process";
import {
  DEFAULT_SUCCESS_REPORT,
  keepAliveForever,
  makeEmitter,
  parseScenario,
  randomSuffix,
  readTextFileSafe,
  traceEnd,
  traceStart,
  waitForStdinEnd,
} from "./scenario.mjs";

const RUNTIME = "opencode";

/** 会消费下一个 argv 元素当自己的值，不能被当成“最后一个位置参数”。 */
const FLAGS_WITH_VALUE = new Set([
  "--dir",
  "-m",
  "--model",
  "--variant",
  "--title",
  "--session",
  "-s",
  "--agent",
  "--log-level",
  "--format",
  "-f",
]);

function extractFlagValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

/** 跳过所有 flag（和它们各自的值），剩下的都是位置参数，按原顺序返回。 */
function extractPositionals(args) {
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("-")) {
      if (FLAGS_WITH_VALUE.has(arg)) {
        i += 1;
      }
      continue;
    }
    positionals.push(arg);
  }
  return positionals;
}

/**
 * 真实 opencode 取任务的方式（调研报告第 3 节）：最后一个位置参数是消息本体；
 * `-f <文件>`（本包自定义，模拟附件）读进来的内容拼在消息前面。
 */
function extractOpencodePrompt(args) {
  const positionals = extractPositionals(args);
  const last = positionals.length > 0 ? positionals[positionals.length - 1] : "";
  const attachmentPath = extractFlagValue(args, "-f");
  const attachmentText = attachmentPath === undefined ? "" : readTextFileSafe(attachmentPath);
  return attachmentText + last;
}

function stepStartEvent(sessionID) {
  const id = randomSuffix();
  return {
    type: "step_start",
    timestamp: Date.now(),
    sessionID,
    part: { id: `prt_fake_${id}`, messageID: `msg_fake_${id}`, sessionID, type: "step-start" },
  };
}

function textEvent(sessionID, text) {
  const id = randomSuffix();
  const end = Date.now();
  return {
    type: "text",
    timestamp: end,
    sessionID,
    part: {
      id: `prt_fake_${id}`,
      messageID: `msg_fake_${id}`,
      sessionID,
      type: "text",
      text,
      time: { start: end - 5, end },
    },
  };
}

function toolUseEvent(sessionID, tool, callId, input, output) {
  const id = randomSuffix();
  const end = Date.now();
  return {
    type: "tool_use",
    timestamp: end,
    sessionID,
    part: {
      type: "tool",
      tool,
      callID: callId,
      id: `prt_fake_${id}`,
      sessionID,
      state: { status: "completed", input, output, time: { start: end - 5, end } },
    },
  };
}

function stepFinishEvent(sessionID, reason) {
  return {
    type: "step_finish",
    timestamp: Date.now(),
    sessionID,
    part: {
      id: `prt_fake_${randomSuffix()}`,
      reason,
      sessionID,
      type: "step-finish",
      tokens: { total: 120, input: 100, output: 20, reasoning: 0, cache: { write: 0, read: 0 } },
      cost: 0,
    },
  };
}

function errorEvent(sessionID, message) {
  return {
    type: "error",
    timestamp: Date.now(),
    sessionID,
    error: { name: "FakeModelError", data: { message } },
  };
}

/**
 * success：step_start → 工具事件 → 文字 → step_finish（reason "stop"，带用量），退出码 0。
 * 回报文字：`opts.text`（scenarioPrompt 的 text 选项传下来的）非空就用它，
 * 否则用固定格式的默认回报，让 parseReport 能读出 verdict "pass"。
 */
async function runSuccess(emit, sessionID, opts) {
  for (let i = 0; i < opts.tools; i += 1) {
    await emit(stepStartEvent(sessionID));
    await emit(
      toolUseEvent(sessionID, "bash", `call_fake_${i}`, { command: "echo fleet-ok" }, "fleet-ok\n"),
    );
    await emit(stepFinishEvent(sessionID, "tool-calls"));
  }
  await emit(stepStartEvent(sessionID));
  const finalText = opts.text.length > 0 ? opts.text : DEFAULT_SUCCESS_REPORT;
  await emit(textEvent(sessionID, finalText));
  await emit(stepFinishEvent(sessionID, "stop"));
  return 0;
}

/** model-error：只输出一行 error 事件，退出码 1。 */
async function runModelError(emit, sessionID) {
  await emit(errorEvent(sessionID, "model not found"));
  return 1;
}

/** no-key：stderr 打印一行错误，退出码 1，stdout 什么都不写。 */
function runNoKey() {
  process.stderr.write("Error: no API key found for mcgrox.\n");
  return 1;
}

/** hang（以及等同于它的 retry-storm）：输出 step_start 后永久等待。 */
async function runHang(emit, sessionID) {
  await emit(stepStartEvent(sessionID));
  keepAliveForever();
  return new Promise(() => {});
}

/** crash：输出一部分事件后直接以配置的退出码退出，末尾没有 step_finish 收尾。 */
async function runCrash(emit, sessionID, exitCode) {
  await emit(stepStartEvent(sessionID));
  await emit(toolUseEvent(sessionID, "bash", "call_fake_crash", { command: "sleep 999" }, ""));
  return exitCode;
}

/** spawn-child-hang：拉起一个会睡眠的子进程，自己也永久等待——用来测进程树能不能被结束干净。 */
function runSpawnChildHang() {
  spawn(process.execPath, ["-e", "setInterval(() => {}, 0x7fffffff);"], { stdio: "ignore" });
  keepAliveForever();
  return new Promise(() => {});
}

function dispatchScenario(opts, emit, sessionID) {
  switch (opts.scenario) {
    case "model-error":
      return runModelError(emit, sessionID);
    case "no-key":
      return runNoKey();
    // opencode 没有内置重试风暴这种模式，retry-storm 按模块设计等同 hang 处理。
    case "hang":
    case "retry-storm":
      return runHang(emit, sessionID);
    case "crash":
      return runCrash(emit, sessionID, opts.exitCode);
    case "spawn-child-hang":
      return runSpawnChildHang();
    default:
      return runSuccess(emit, sessionID, opts);
  }
}

async function main() {
  const args = process.argv.slice(2);
  traceStart(RUNTIME, args);

  await waitForStdinEnd();

  const promptText = extractOpencodePrompt(args);
  const opts = parseScenario(promptText);
  const sessionID =
    extractFlagValue(args, "--session") ??
    extractFlagValue(args, "-s") ??
    `ses_fake${randomSuffix()}`;
  const emit = makeEmitter(opts.delayMs);

  const exitCode = await dispatchScenario(opts, emit, sessionID);
  traceEnd(RUNTIME);
  process.exitCode = exitCode;
}

main().catch((error) => {
  process.stderr.write(`fake-opencode 内部出错：${String(error)}\n`);
  process.exitCode = 1;
});
