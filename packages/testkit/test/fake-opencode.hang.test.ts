/**
 * 假 opencode 里「不会自己退出」的剧本：hang、等同 hang 的 retry-storm、
 * spawn-child-hang，以及和剧本无关、单独验证的「stdin 不关闭会卡住」这条通用行为。
 * 这些用例都必须由测试自己动手结束进程——它们本来就不会自己停。
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeOpencodeCommand, readTrace, scenarioPrompt } from "../src/index.js";
import { lineType } from "./support/json.js";
import {
  killAndWait,
  readLinesUntil,
  spawnFake,
  spawnFakeWithOpenStdin,
  stillRunningAfter,
} from "./support/spawnFake.js";

const OPENCODE = fakeOpencodeCommand();

function opencodeArgs(session: string, prompt: string): string[] {
  return ["run", "--format", "json", "--auto", "--session", session, prompt];
}

describe("fake-opencode：hang / retry-storm（等同 hang）/ spawn-child-hang", () => {
  let traceDir: string;
  let traceFile: string;

  beforeEach(() => {
    traceDir = mkdtempSync(join(tmpdir(), "fleet-fake-opencode-hang-"));
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

  it("hang：只输出 step_start 就永久等待，1 秒内不退出，测完手动结束", async () => {
    const child = spawnFake(OPENCODE, opencodeArgs("fake-test-oc-hang", scenarioPrompt("hang")), {
      FLEET_FAKE_TRACE: traceFile,
    });

    const lines = await readLinesUntil(child, (got) => got.length >= 1, 5000);
    expect(lines).toHaveLength(1);
    expect(lineType(lines[0] ?? "")).toBe("step_start");

    expect(await stillRunningAfter(child, 1000)).toBe(true);

    await killAndWait(child);
    expect(readTrace(traceFile).map((e) => e.event)).toEqual(["start"]);
  });

  it("retry-storm：opencode 没有这个模式，按规格等同 hang——同样只输出 step_start 就卡住", async () => {
    const child = spawnFake(
      OPENCODE,
      opencodeArgs("fake-test-oc-retry-storm", scenarioPrompt("retry-storm")),
      { FLEET_FAKE_TRACE: traceFile },
    );

    const lines = await readLinesUntil(child, (got) => got.length >= 1, 5000);
    expect(lineType(lines[0] ?? "")).toBe("step_start");
    expect(await stillRunningAfter(child, 200)).toBe(true);

    await killAndWait(child);
    expect(readTrace(traceFile).map((e) => e.event)).toEqual(["start"]);
  });

  it("spawn-child-hang：拉起一个子进程后自己也永久等待，taskkill /T /F 能把整棵树收掉", async () => {
    const child = spawnFake(
      OPENCODE,
      opencodeArgs("fake-test-oc-spawn-child", scenarioPrompt("spawn-child-hang")),
      { FLEET_FAKE_TRACE: traceFile },
    );

    expect(await stillRunningAfter(child, 500)).toBe(true);

    await killAndWait(child);
    expect(readTrace(traceFile).map((e) => e.event)).toEqual(["start"]);
  });

  it("stdin 不关闭：假 opencode 会一直卡在读 stdin 这一步，什么都不输出，1 秒内不退出", async () => {
    const child = spawnFakeWithOpenStdin(
      OPENCODE,
      opencodeArgs("fake-test-oc-stdin-hang", scenarioPrompt("success")),
    );

    expect(await stillRunningAfter(child, 1000)).toBe(true);
    expect(child.stdout.readableLength).toBe(0);

    await killAndWait(child);
  });
});
