/**
 * 分离启动的真实进程测试（规格第 3.3、4 节）：多行/引号/中文参数原样到达、stdin 关闭、
 * stdout/stderr 分别写文件、退出码可取、工作目录不存在时报错。全部用假 pi（@fleet/testkit）
 * 当真实子进程跑，不依赖真实模型。
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LaunchFile } from "@fleet/core";
import { fakePiCommand, readTrace, scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { killTree } from "../../src/process/killTree.js";
import { spawnWorker } from "../../src/process/spawnWorker.js";
import type {
  ProcessExitInfo,
  ResolvedCommand,
  SpawnedProcess,
  SpawnRequest,
} from "../../src/process/types.js";
import { snapshotProcessEnv } from "../../src/process/userEnv.js";
import { createTempDir, removeTempDir } from "./support/tempDir.js";

const PI = fakePiCommand();
const PI_COMMAND: ResolvedCommand = {
  executable: PI[0] ?? "",
  prefixArgs: PI.slice(1),
  image: "node.exe",
};

function waitForExit(spawned: SpawnedProcess): Promise<ProcessExitInfo> {
  return new Promise((resolve) => spawned.onExit(resolve));
}

describe("spawnWorker（真实子进程）", () => {
  let tempDir: string;
  let spawnedPids: number[];
  let traceFile: string;

  beforeEach(async () => {
    tempDir = await createTempDir("fleet-spawnworker-");
    spawnedPids = [];
    traceFile = join(tempDir, "trace.jsonl");
  });

  afterEach(async () => {
    for (const pid of spawnedPids) {
      await killTree(pid);
    }
    await removeTempDir(tempDir);
  });

  function baseRequest(args: string[], files: LaunchFile[] = []): SpawnRequest {
    return {
      command: PI_COMMAND,
      args,
      cwd: tempDir,
      env: { ...snapshotProcessEnv(), FLEET_FAKE_TRACE: traceFile },
      stdoutPath: join(tempDir, "run", "out.jsonl"),
      stderrPath: join(tempDir, "run", "err.log"),
      files,
    };
  }

  it("多行、带引号、带中文的参数原样到达子进程（不经过任何 shell）", async () => {
    const trickyText = 'first line\nsecond "line" with 中文字符\nthird line 结束';
    const prompt = scenarioPrompt("success", { delayMs: 1, text: trickyText });
    const args = ["--session-id", "argv-fidelity", "-p", prompt];

    const spawned = await spawnWorker(baseRequest(args));
    spawnedPids.push(spawned.pid);
    const exit = await waitForExit(spawned);
    expect(exit.code).toBe(0);

    const trace = readTrace(traceFile);
    const start = trace.find((entry) => entry.event === "start");
    expect(start).toBeDefined();
    expect(start?.args).toEqual(args);
    // 单独再断言一次那个最容易被截断/破坏的参数，字符级完全相等。
    expect(start?.args?.[3]).toBe(prompt);
  });

  it("stdin 关闭：success 剧本很快正常退出（stdin 不关闭时假 pi 会永久卡住，见测试支撑模块设计）", async () => {
    const prompt = scenarioPrompt("success", { delayMs: 1, tools: 1 });
    const spawned = await spawnWorker(baseRequest(["--session-id", "stdin-test", "-p", prompt]));
    spawnedPids.push(spawned.pid);

    const exit = await waitForExit(spawned);
    expect(exit.code).toBe(0);
    expect(exit.signal).toBeNull();
  });

  it("stdout 原样追加写入文件，内容能被解析成事件流", async () => {
    const prompt = scenarioPrompt("success", { delayMs: 1, tools: 1 });
    const request = baseRequest(["--session-id", "stdout-test", "-p", prompt]);
    const spawned = await spawnWorker(request);
    spawnedPids.push(spawned.pid);
    await waitForExit(spawned);

    const stdout = await readFile(request.stdoutPath, "utf8");
    const lines = stdout.split("\n").filter((line) => line.trim().length > 0);
    expect(lines.length).toBeGreaterThan(0);
    const types = lines.map((line): unknown => JSON.parse(line));
    expect(types.some((event) => isEventOfType(event, "session"))).toBe(true);
    expect(types.some((event) => isEventOfType(event, "agent_settled"))).toBe(true);
  });

  it("stderr 原样追加写入文件（no-key 剧本会把提示打到 stderr）", async () => {
    const prompt = scenarioPrompt("no-key");
    const request = baseRequest(["--session-id", "stderr-test", "-p", prompt]);
    const spawned = await spawnWorker(request);
    spawnedPids.push(spawned.pid);
    const exit = await waitForExit(spawned);

    expect(exit.code).toBe(1);
    const stderr = await readFile(request.stderrPath, "utf8");
    expect(stderr).toContain("No API key found for mcgrox.");
  });

  it("退出码能拿到；迟注册的监听者也能收到缓存的退出信息", async () => {
    const prompt = scenarioPrompt("success", { delayMs: 1 });
    const spawned = await spawnWorker(baseRequest(["--session-id", "late-listener", "-p", prompt]));
    spawnedPids.push(spawned.pid);

    const first = await waitForExit(spawned);
    expect(first.code).toBe(0);

    // 进程这时已经退出了，再注册一个监听者，应该立刻收到缓存的退出信息，而不是永远不触发。
    const late = await waitForExit(spawned);
    expect(late).toEqual(first);
  });

  it("工作目录不存在时抛 FleetError('invalid_request')", async () => {
    const badCwd = join(tempDir, "does-not-exist");
    const request = { ...baseRequest(["--session-id", "x", "-p", "hi"]), cwd: badCwd };
    await expect(spawnWorker(request)).rejects.toMatchObject({ code: "invalid_request" });
  });

  it("files 里的文件会在启动前建好父目录并按 UTF-8 写入", async () => {
    const filePath = join(tempDir, "nested", "deep", "task.md");
    const content = "任务说明\n第二行，带逗号和中文标点。";
    const prompt = scenarioPrompt("success", { delayMs: 1 });
    const request = baseRequest(
      ["--session-id", "files-test", "-p", prompt],
      [{ path: filePath, content }],
    );

    const spawned = await spawnWorker(request);
    spawnedPids.push(spawned.pid);
    await waitForExit(spawned);

    const written = await readFile(filePath, "utf8");
    expect(written).toBe(content);
  });
});

function isEventOfType(value: unknown, type: string): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("type" in value)) {
    return false;
  }
  return value.type === type;
}
