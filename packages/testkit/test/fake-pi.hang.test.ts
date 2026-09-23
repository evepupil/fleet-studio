/**
 * 假 pi 里「不会自己退出」的三个剧本：hang / retry-storm / spawn-child-hang，
 * 以及和剧本无关、单独验证的「stdin 不关闭会卡住」这条通用行为。
 * 这四个用例都必须由测试自己动手结束进程——它们本来就不会自己停。
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getRuntimeAdapter, PI_MAX_CONSECUTIVE_FAILURES } from "@fleet/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakePiCommand, readTrace, scenarioPrompt } from "../src/index.js";
import { lineType } from "./support/json.js";
import {
  killAndWait,
  readLinesUntil,
  spawnFake,
  spawnFakeWithOpenStdin,
  stillRunningAfter,
} from "./support/spawnFake.js";

const PI = fakePiCommand();

function reachedEndedByConsecutiveFailures(lines: readonly string[]): boolean {
  const reducer = getRuntimeAdapter("pi").createReducer();
  for (const line of lines) {
    reducer.push(line, "stdout", "2026-09-23T00:00:00.000Z");
  }
  return reducer.progress().phase === "ended";
}

describe("fake-pi：hang / retry-storm / spawn-child-hang", () => {
  let traceDir: string;
  let traceFile: string;

  beforeEach(() => {
    traceDir = mkdtempSync(join(tmpdir(), "fleet-fake-pi-hang-"));
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

  it("hang：只输出会话行就永久等待，1 秒内不退出，测完手动结束", async () => {
    const prompt = scenarioPrompt("hang");
    const child = spawnFake(PI, ["--session-id", "fake-test-hang", "-p", prompt], {
      FLEET_FAKE_TRACE: traceFile,
    });

    const lines = await readLinesUntil(child, (got) => got.length >= 1, 5000);
    expect(lines).toHaveLength(1);
    expect(lineType(lines[0] ?? "")).toBe("session");

    expect(await stillRunningAfter(child, 1000)).toBe(true);

    await killAndWait(child);
    expect(readTrace(traceFile).map((e) => e.event)).toEqual(["start"]);
  });

  it(`retry-storm：连续失败够 ${PI_MAX_CONSECUTIVE_FAILURES} 次后解析器判定 ended，但进程自己永不退出`, async () => {
    const prompt = scenarioPrompt("retry-storm", { delayMs: 2 });
    const child = spawnFake(PI, ["--session-id", "fake-test-retry-storm", "-p", prompt], {
      FLEET_FAKE_TRACE: traceFile,
    });

    await readLinesUntil(child, reachedEndedByConsecutiveFailures, 5000);
    expect(await stillRunningAfter(child, 200)).toBe(true);

    await killAndWait(child);
    expect(readTrace(traceFile).map((e) => e.event)).toEqual(["start"]);
  });

  it("spawn-child-hang：拉起一个子进程后自己也永久等待，taskkill /T /F 能把整棵树收掉", async () => {
    const child = spawnFake(
      PI,
      ["--session-id", "fake-test-spawn-child", "-p", scenarioPrompt("spawn-child-hang")],
      { FLEET_FAKE_TRACE: traceFile },
    );

    expect(await stillRunningAfter(child, 500)).toBe(true);

    await killAndWait(child);
    expect(readTrace(traceFile).map((e) => e.event)).toEqual(["start"]);
  });

  it("stdin 不关闭：假 pi 会一直卡在读 stdin 这一步，什么都不输出，1 秒内不退出", async () => {
    const child = spawnFakeWithOpenStdin(PI, [
      "--session-id",
      "fake-test-stdin-hang",
      "-p",
      scenarioPrompt("success"),
    ]);

    expect(await stillRunningAfter(child, 1000)).toBe(true);
    expect(child.stdout.readableLength).toBe(0);

    await killAndWait(child);
  });
});
