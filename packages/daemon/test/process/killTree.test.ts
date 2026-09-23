/**
 * killTree 的真实进程测试（规格第 3.4、4 节）：结束整棵进程树，父子进程都要确认不在了。
 */

import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fakePiCommand, scenarioPrompt } from "@fleet/testkit";
import { afterEach, describe, expect, it } from "vitest";
import { killTree } from "../../src/process/killTree.js";
import { isProcessAlive } from "../../src/process/processProbe.js";
import { waitFor } from "./support/waitFor.js";

const execFileAsync = promisify(execFile);
const PI = fakePiCommand();

/**
 * 测试专用：用 CIM 精确找出某个 pid 的直接子进程。比"tasklist 里数 node.exe 差集"稳，
 * 这台开发机上可能同时有别的 node.exe 在跑（docs/调研 两份运行时报告都记录过并发探测的意外）。
 */
async function findChildPids(parentPid: number): Promise<number[]> {
  const { stdout } = await execFileAsync("powershell", [
    "-NoProfile",
    "-Command",
    `Get-CimInstance Win32_Process -Filter "ParentProcessId=${parentPid}" | Select-Object -ExpandProperty ProcessId`,
  ]);
  return stdout
    .split(/\r?\n/)
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => !Number.isNaN(pid));
}

describe.runIf(process.platform === "win32")("killTree（真实进程树）", () => {
  const spawnedForCleanup: number[] = [];

  afterEach(async () => {
    for (const pid of spawnedForCleanup.splice(0)) {
      await killTree(pid);
    }
  });

  it("结束整棵进程树：父进程和它拉起的子进程都不在了", async () => {
    const prompt = scenarioPrompt("spawn-child-hang");
    const executable = PI[0] ?? "";
    const child: ChildProcess = spawn(
      executable,
      [...PI.slice(1), "--session-id", "kill-tree-test", "-p", prompt],
      { stdio: "ignore" },
    );
    const parentPid = child.pid;
    expect(parentPid).toBeDefined();
    if (parentPid === undefined) {
      return;
    }
    spawnedForCleanup.push(parentPid);

    let grandchildPid: number | undefined;
    await waitFor(
      async () => {
        const children = await findChildPids(parentPid);
        grandchildPid = children[0];
        return grandchildPid !== undefined;
      },
      { timeoutMs: 5000 },
    );
    expect(grandchildPid).toBeDefined();
    if (grandchildPid === undefined) {
      return;
    }

    expect(await isProcessAlive(parentPid, "node.exe")).toBe(true);
    expect(await isProcessAlive(grandchildPid, "node.exe")).toBe(true);

    await killTree(parentPid);

    expect(await isProcessAlive(parentPid, "node.exe")).toBe(false);
    expect(await isProcessAlive(grandchildPid, "node.exe")).toBe(false);
  });

  it("结束一个已经不存在的进程：静默返回，不抛异常", async () => {
    await expect(killTree(999_999)).resolves.toBeUndefined();
  });

  it("结束一个普通的单个挂起进程", async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 0x7fffffff);"], {
      stdio: "ignore",
    });
    const pid = child.pid;
    expect(pid).toBeDefined();
    if (pid === undefined) {
      return;
    }
    spawnedForCleanup.push(pid);

    expect(await isProcessAlive(pid, "node.exe")).toBe(true);
    await killTree(pid);
    expect(await isProcessAlive(pid, "node.exe")).toBe(false);
  });
});
