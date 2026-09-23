/**
 * 假 opencode 的四个「自己会退出」的剧本：success / model-error / no-key / crash。
 * 每个剧本的输出都交给 @fleet/core 真正的 opencode 事件流解析器解析一遍，
 * 确认假苦工吐出来的格式真的能被生产代码认得懂（不是自己写自己读的循环论证）。
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRuntimeAdapter, parseReport } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeOpencodeCommand, readTrace, scenarioPrompt } from "../src/index.js";
import { getString, isRecord, lineType } from "./support/json.js";
import { runToCompletion, spawnFake, toLines } from "./support/spawnFake.js";

const OPENCODE = fakeOpencodeCommand();

/** 贴近 packages/core/src/runtimes/opencode/args.ts 续接分支拼出来的完整参数形状。 */
function opencodeArgs(session: string, prompt: string): string[] {
  return [
    "run",
    "--format",
    "json",
    "--auto",
    "--dir",
    process.cwd(),
    "-m",
    "mcgrox/deepseek-v4.1-flash",
    "--session",
    session,
    "--thinking",
    prompt,
  ];
}

function parseWithOpencodeReducer(lines: readonly string[]) {
  const reducer = getRuntimeAdapter("opencode").createReducer();
  for (const line of lines) {
    reducer.push(line, "stdout", "2026-09-23T00:00:00.000Z");
  }
  return reducer.progress();
}

describe("fake-opencode：success / model-error / no-key / crash", () => {
  let traceDir: string;
  let traceFile: string;

  beforeEach(() => {
    traceDir = mkdtempSync(join(tmpdir(), "fleet-fake-opencode-"));
    traceFile = join(traceDir, "trace.jsonl");
  });

  afterEach(() => {
    // 收尾是尽力而为：删不掉不能让测试跟着失败，但也不能静默吞掉，打一行警告方便发现。
    try {
      rmSync(traceDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (error) {
      console.warn(`删除临时目录失败（可能是系统占用），忽略：${traceDir}`, error);
    }
  });

  it("success：解析出的进展 outcome 是已完成，退出码 0，会话编号取自 --session", async () => {
    const prompt = scenarioPrompt("success", { delayMs: 1, tools: 2 });
    const child = spawnFake(OPENCODE, opencodeArgs("fake-test-oc-success", prompt), {
      FLEET_FAKE_TRACE: traceFile,
    });
    const result = await runToCompletion(child);

    expect(result.exitCode).toBe(0);
    const lines = toLines(result.stdout);
    const progress = parseWithOpencodeReducer(lines);
    expect(progress.outcome).toEqual({ status: "completed" });
    expect(progress.sessionRef).toBe("fake-test-oc-success");

    // 规格 3.1：success 最后一条模型文字是固定格式回报，parseReport 能读出 verdict "pass"。
    const report = parseReport(progress.finalText ?? "");
    expect(report?.verdict).toBe("pass");

    const trace = readTrace(traceFile);
    expect(trace.map((e) => e.event)).toEqual(["start", "end"]);
  });

  it("success：scenarioPrompt 传了 text 就用传入的覆盖默认回报（原有行为不变）", async () => {
    const customText = "SUMMARY: 自定义回报\nSELF_REPORT: fail\nBLOCKED: 无";
    const prompt = scenarioPrompt("success", { delayMs: 1, text: customText });
    const child = spawnFake(OPENCODE, opencodeArgs("fake-test-oc-success-custom", prompt), {
      FLEET_FAKE_TRACE: traceFile,
    });
    const result = await runToCompletion(child);

    expect(result.exitCode).toBe(0);
    const progress = parseWithOpencodeReducer(toLines(result.stdout));
    expect(progress.finalText).toBe(customText);
    expect(parseReport(progress.finalText ?? "")?.verdict).toBe("fail");
  });

  it("model-error：只有一行 error 事件，解析出的 outcome 是失败 model_error，退出码 1", async () => {
    const prompt = scenarioPrompt("model-error", { delayMs: 1 });
    const child = spawnFake(OPENCODE, opencodeArgs("fake-test-oc-model-error", prompt), {
      FLEET_FAKE_TRACE: traceFile,
    });
    const result = await runToCompletion(child);

    expect(result.exitCode).toBe(1);
    const lines = toLines(result.stdout);
    expect(lines).toHaveLength(1);
    expect(lineType(lines[0] ?? "")).toBe("error");
    const progress = parseWithOpencodeReducer(lines);
    expect(progress.outcome).toMatchObject({ status: "failed", reason: "model_error" });
  });

  it("no-key：stdout 什么都不写，stderr 有提示，退出码 1", async () => {
    const prompt = scenarioPrompt("no-key");
    const child = spawnFake(OPENCODE, opencodeArgs("fake-test-oc-no-key", prompt), {
      FLEET_FAKE_TRACE: traceFile,
    });
    const result = await runToCompletion(child);

    expect(result.exitCode).toBe(1);
    expect(result.stderr.length).toBeGreaterThan(0);
    expect(toLines(result.stdout)).toHaveLength(0);
  });

  it("crash：以配置的退出码退出，末尾没有 step_finish 收尾事件", async () => {
    const prompt = scenarioPrompt("crash", { delayMs: 1, exitCode: 9 });
    const child = spawnFake(OPENCODE, opencodeArgs("fake-test-oc-crash", prompt), {
      FLEET_FAKE_TRACE: traceFile,
    });
    const result = await runToCompletion(child);

    expect(result.exitCode).toBe(9);
    const lines = toLines(result.stdout);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const parsed: unknown = JSON.parse(line);
      expect(isRecord(parsed) && getString(parsed, "sessionID")).toBe("fake-test-oc-crash");
    }
    expect(lines.map((line) => lineType(line))).not.toContain("step_finish");
  });
});
