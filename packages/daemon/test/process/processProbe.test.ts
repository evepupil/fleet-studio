/**
 * parseTasklistCsv 纯测 + isProcessAlive 的真实进程测试（规格第 3.5、4 节）。
 */

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { killTree } from "../../src/process/killTree.js";
import { isProcessAlive, parseTasklistCsv } from "../../src/process/processProbe.js";
import { waitFor } from "./support/waitFor.js";

describe("parseTasklistCsv", () => {
  it("解析正常的一行，内存用量里的逗号不会打乱字段", () => {
    const output = '"pwsh.exe","52872","Console","1","89,720 K"';
    expect(parseTasklistCsv(output)).toEqual([{ imageName: "pwsh.exe", pid: 52872 }]);
  });

  it("解析多行", () => {
    const output = [
      '"System Idle Process","0","Services","0","8 K"',
      '"node.exe","1234","Console","1","20,480 K"',
    ].join("\r\n");
    expect(parseTasklistCsv(output)).toEqual([
      { imageName: "System Idle Process", pid: 0 },
      { imageName: "node.exe", pid: 1234 },
    ]);
  });

  it("没有任务时的提示行（不以引号开头）被跳过，返回空数组", () => {
    const output = "INFO: No tasks are running which match the specified criteria.";
    expect(parseTasklistCsv(output)).toEqual([]);
  });

  it("空字符串和空行都跳过", () => {
    expect(parseTasklistCsv("")).toEqual([]);
    expect(parseTasklistCsv("\r\n\r\n")).toEqual([]);
  });
});

describe("isProcessAlive（真实进程）", () => {
  const spawned: ChildProcess[] = [];

  afterEach(async () => {
    for (const child of spawned.splice(0)) {
      if (child.pid !== undefined) {
        await killTree(child.pid);
      }
    }
  });

  it("进程存活时返回 true，退出后返回 false", async () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 3000)"], {
      stdio: "ignore",
    });
    spawned.push(child);
    const pid = child.pid;
    expect(pid).toBeDefined();
    if (pid === undefined) return;

    expect(await isProcessAlive(pid, null)).toBe(true);

    child.kill();
    await waitFor(async () => !(await isProcessAlive(pid, null)));
    expect(await isProcessAlive(pid, null)).toBe(false);
  });

  // image 核对只在 Windows 分支上生效（规格第 3.5 节：其他平台不核对映像名）。
  it.runIf(process.platform === "win32")(
    "image 不匹配时视为不活（进程号可能已经被系统复用）",
    async () => {
      const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 3000)"], {
        stdio: "ignore",
      });
      spawned.push(child);
      const pid = child.pid;
      expect(pid).toBeDefined();
      if (pid === undefined) return;

      expect(await isProcessAlive(pid, "definitely-not-node.exe")).toBe(false);
      expect(await isProcessAlive(pid, "NODE.EXE")).toBe(true); // 不区分大小写
    },
  );

  it("不存在的 pid 返回 false", async () => {
    expect(await isProcessAlive(999_999, null)).toBe(false);
  });
});
