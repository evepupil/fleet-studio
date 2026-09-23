#!/usr/bin/env node
/**
 * 假 pi：按任务文字里的剧本标记，吐出和真实 pi `--mode json` 一模一样格式的事件流、
 * 退出码和 stderr。给集成测试和看板演示用，不依赖真实模型。
 *
 * 事件字段照 docs/调研/pi-运行时.md 第 3、4 节和
 * packages/core/test/fixtures/pi/ 下的真实抓包逐字段模仿；最终会被
 * packages/core/src/runtimes/pi/reducer.ts 解析，字段名和形状必须对得上那边实际读取的部分。
 * 规格见 docs/模块设计/测试支撑-假苦工.md。
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

const RUNTIME = "pi";

/** 真实样本里常见的一份用量：input 100、output 20（模块设计 3.1 节给的例子）。 */
const SAMPLE_USAGE = {
  input: 100,
  output: 20,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 120,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function extractFlagValue(args, flag) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

/**
 * 真实 pi 取任务的方式（调研报告第 2、6 节）：`-p`/`--print` 后面紧跟的那个参数是消息本体；
 * `@<文件>` 会被整份读入、拼在消息前面。假 pi 照这个规则从 argv 里还原出完整任务文字，
 * 好让藏在里面任何位置的 [[scenario:...]] 标记都能被找到。
 */
function extractPiPrompt(args) {
  const printValue = extractFlagValue(args, "-p") ?? extractFlagValue(args, "--print") ?? "";
  const fileText = args
    .filter((arg) => arg.startsWith("@"))
    .map((arg) => readTextFileSafe(arg.slice(1)))
    .join("");
  return fileText + printValue;
}

function assistantMessage({ content, stopReason, errorMessage, usage = SAMPLE_USAGE }) {
  const message = {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "mcgrox",
    model: "deepseek-v4.1-flash",
    usage,
    stopReason,
    timestamp: Date.now(),
  };
  if (errorMessage !== undefined) {
    message.errorMessage = errorMessage;
  }
  return { type: "message_end", message };
}

function toolResultMessage(callId, tool, text) {
  return {
    type: "message_end",
    message: {
      role: "toolResult",
      toolCallId: callId,
      toolName: tool,
      content: [{ type: "text", text }],
      isError: false,
      timestamp: Date.now(),
    },
  };
}

function toolCallItem(callId, tool, args) {
  return { type: "toolCall", id: callId, name: tool, arguments: args };
}

/**
 * success：若干轮工具调用和结果，最后一条带回报的助手文字（stopReason: "stop"）。
 * 回报文字：`opts.text`（scenarioPrompt 的 text 选项传下来的）非空就用它，
 * 否则用固定格式的默认回报，让 parseReport 能读出 verdict "pass"。
 */
async function runSuccess(emit, opts) {
  await emit({ type: "agent_start" });
  await emit({ type: "turn_start" });
  for (let i = 0; i < opts.tools; i += 1) {
    const callId = `call_fake_${i}`;
    await emit(
      assistantMessage({
        content: [toolCallItem(callId, "bash", { command: "echo fleet-ok" })],
        stopReason: "toolUse",
      }),
    );
    await emit(toolResultMessage(callId, "bash", "fleet-ok\n"));
  }
  await emit({ type: "turn_end" });
  await emit({ type: "turn_start" });
  const finalText = opts.text.length > 0 ? opts.text : DEFAULT_SUCCESS_REPORT;
  await emit(
    assistantMessage({ content: [{ type: "text", text: finalText }], stopReason: "stop" }),
  );
  await emit({ type: "turn_end" });
  await emit({ type: "agent_end", willRetry: false });
  await emit({ type: "agent_settled" });
  return 0;
}

/** model-error：一条 stopReason "error" 的助手消息，errorMessage 是上游 404，退出码仍是 0。 */
async function runModelError(emit) {
  await emit(
    assistantMessage({ content: [], stopReason: "error", errorMessage: "404: model not found" }),
  );
  await emit({ type: "agent_end", willRetry: false });
  await emit({ type: "agent_settled" });
  return 0;
}

/**
 * retry-storm：无限循环“失败的助手消息 + auto_retry_start”，永不发 agent_settled、
 * 永不退出（调研报告第 4 节：通道持续报错时 pi 自己不会放弃）。
 */
async function runRetryStorm(emit) {
  let attempt = 0;
  for (;;) {
    attempt = (attempt % 3) + 1;
    await emit({ type: "agent_start" });
    await emit({ type: "turn_start" });
    await emit(
      assistantMessage({ content: [], stopReason: "error", errorMessage: "Connection error." }),
    );
    await emit({ type: "turn_end" });
    await emit({ type: "agent_end", willRetry: true });
    await emit({
      type: "auto_retry_start",
      attempt,
      maxAttempts: 3,
      delayMs: 2000 * attempt,
      errorMessage: "Connection error.",
    });
  }
}

/** no-key：stdout 只有会话行（在 main 里已经发出），stderr 打印固定提示，退出码 1。 */
function runNoKey() {
  process.stderr.write("No API key found for mcgrox.\n");
  return 1;
}

/** hang：输出会话行后（在 main 里已经发出）永久等待，不退出、不再输出。 */
function runHang() {
  keepAliveForever();
  return new Promise(() => {});
}

/** crash：输出一部分事件后直接以配置的退出码退出，末尾没有 agent_end/agent_settled 收尾。 */
async function runCrash(emit, exitCode) {
  await emit({ type: "agent_start" });
  await emit({ type: "turn_start" });
  await emit(
    assistantMessage({
      content: [toolCallItem("call_fake_crash", "bash", { command: "sleep 999" })],
      stopReason: "toolUse",
    }),
  );
  return exitCode;
}

/** spawn-child-hang：拉起一个会睡眠的子进程，自己也永久等待——用来测进程树能不能被结束干净。 */
function runSpawnChildHang() {
  spawn(process.execPath, ["-e", "setInterval(() => {}, 0x7fffffff);"], { stdio: "ignore" });
  keepAliveForever();
  return new Promise(() => {});
}

function dispatchScenario(opts, emit) {
  switch (opts.scenario) {
    case "model-error":
      return runModelError(emit);
    case "retry-storm":
      return runRetryStorm(emit);
    case "no-key":
      return runNoKey();
    case "hang":
      return runHang();
    case "crash":
      return runCrash(emit, opts.exitCode);
    case "spawn-child-hang":
      return runSpawnChildHang();
    default:
      return runSuccess(emit, opts);
  }
}

async function main() {
  const args = process.argv.slice(2);
  traceStart(RUNTIME, args);

  await waitForStdinEnd();

  const promptText = extractPiPrompt(args);
  const opts = parseScenario(promptText);
  const sessionId = extractFlagValue(args, "--session-id") ?? `fake-pi-${randomSuffix()}`;
  const emit = makeEmitter(opts.delayMs);

  await emit({
    type: "session",
    version: 3,
    id: sessionId,
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
  });

  const exitCode = await dispatchScenario(opts, emit);
  traceEnd(RUNTIME);
  process.exitCode = exitCode;
}

main().catch((error) => {
  process.stderr.write(`fake-pi 内部出错：${String(error)}\n`);
  process.exitCode = 1;
});
