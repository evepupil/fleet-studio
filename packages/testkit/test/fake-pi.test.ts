/**
 * 假 pi 的四个「自己会退出」的剧本：success / model-error / no-key / crash。
 * 每个剧本的输出都交给 @fleet/core 真正的 pi 事件流解析器解析一遍，
 * 确认假苦工吐出来的格式真的能被生产代码认得懂（不是自己写自己读的循环论证）。
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRuntimeAdapter, parseReport } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakePiCommand, readTrace, scenarioPrompt } from "../src/index.js";
import { getString, isRecord, lineType } from "./support/json.js";
import { runToCompletion, spawnFake, toLines } from "./support/spawnFake.js";

const PI = fakePiCommand();

function parseWithPiReducer(lines: readonly string[]) {
  const reducer = getRuntimeAdapter("pi").createReducer();
  for (const line of lines) {
    reducer.push(line, "stdout", "2026-09-23T00:00:00.000Z");
  }
  return reducer.progress();
}

describe("fake-pi：success / model-error / no-key / crash", () => {
  let traceDir: string;
  let traceFile: string;

  beforeEach(() => {
    traceDir = mkdtempSync(join(tmpdir(), "fleet-fake-pi-"));
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

  it("success：解析出的进展 outcome 是已完成，退出码 0，会话编号取自 --session-id", async () => {
    const prompt = scenarioPrompt("success", { delayMs: 1, tools: 2 });
    const child = spawnFake(PI, ["--session-id", "fake-test-success", "-p", prompt], {
      FLEET_FAKE_TRACE: traceFile,
    });
    const result = await runToCompletion(child);

    expect(result.exitCode).toBe(0);
    const lines = toLines(result.stdout);
    const progress = parseWithPiReducer(lines);
    expect(progress.outcome).toEqual({ status: "completed" });
    expect(progress.sessionRef).toBe("fake-test-success");

    // 规格 3.1：success 最后一条模型文字是固定格式回报，parseReport 能读出 verdict "pass"。
    const report = parseReport(progress.finalText ?? "");
    expect(report?.verdict).toBe("pass");

    const trace = readTrace(traceFile);
    expect(trace.map((e) => e.event)).toEqual(["start", "end"]);
  });

  it("success：scenarioPrompt 传了 text 就用传入的覆盖默认回报（原有行为不变）", async () => {
    const customText = "SUMMARY: 自定义回报\nSELF_REPORT: fail\nBLOCKED: 无";
    const prompt = scenarioPrompt("success", { delayMs: 1, text: customText });
    const child = spawnFake(PI, ["--session-id", "fake-test-success-custom", "-p", prompt], {
      FLEET_FAKE_TRACE: traceFile,
    });
    const result = await runToCompletion(child);

    expect(result.exitCode).toBe(0);
    const progress = parseWithPiReducer(toLines(result.stdout));
    expect(progress.finalText).toBe(customText);
    expect(parseReport(progress.finalText ?? "")?.verdict).toBe("fail");
  });

  it("model-error：解析出的进展 outcome 是失败 model_error，退出码 0", async () => {
    const prompt = scenarioPrompt("model-error", { delayMs: 1 });
    const child = spawnFake(PI, ["--session-id", "fake-test-model-error", "-p", prompt], {
      FLEET_FAKE_TRACE: traceFile,
    });
    const result = await runToCompletion(child);

    expect(result.exitCode).toBe(0);
    const progress = parseWithPiReducer(toLines(result.stdout));
    expect(progress.outcome).toMatchObject({ status: "failed", reason: "model_error" });
  });

  it("no-key：stdout 只有会话行，stderr 有提示，退出码 1", async () => {
    const prompt = scenarioPrompt("no-key");
    const child = spawnFake(PI, ["--session-id", "fake-test-no-key", "-p", prompt], {
      FLEET_FAKE_TRACE: traceFile,
    });
    const result = await runToCompletion(child);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("No API key found for mcgrox.");
    const lines = toLines(result.stdout);
    expect(lines).toHaveLength(1);
    const parsed: unknown = JSON.parse(lines[0] ?? "");
    expect(isRecord(parsed) && getString(parsed, "type")).toBe("session");
  });

  it("crash：以配置的退出码退出，末尾没有 agent_settled 收尾事件", async () => {
    const prompt = scenarioPrompt("crash", { delayMs: 1, exitCode: 7 });
    const child = spawnFake(PI, ["--session-id", "fake-test-crash", "-p", prompt], {
      FLEET_FAKE_TRACE: traceFile,
    });
    const result = await runToCompletion(child);

    expect(result.exitCode).toBe(7);
    const lines = toLines(result.stdout);
    expect(lines.length).toBeGreaterThan(0);
    const types = lines.map((line) => lineType(line));
    expect(types).not.toContain("agent_settled");
    expect(types).not.toContain("agent_end");
  });
});
