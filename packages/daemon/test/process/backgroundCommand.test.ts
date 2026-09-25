import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runBackgroundCommand } from "../../src/process/backgroundCommand.js";
import { killTree } from "../../src/process/killTree.js";
import { spawnWorker } from "../../src/process/spawnWorker.js";
import type { ProcessExitInfo } from "../../src/process/types.js";
import { snapshotProcessEnv } from "../../src/process/userEnv.js";
import { createTempDir, removeTempDir } from "./support/tempDir.js";

// 从子命令内部检查它的控制台是否可见，不靠截屏捕捉短暂闪出的窗口。
const CONSOLE_VISIBILITY_QUERY = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FleetConsoleVisibility {
  [DllImport("kernel32.dll")]
  public static extern IntPtr GetConsoleWindow();
  [DllImport("user32.dll")]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool IsWindowVisible(IntPtr window);
}
'@
[Console]::Write([FleetConsoleVisibility]::IsWindowVisible([FleetConsoleVisibility]::GetConsoleWindow()))
`;

describe("后台辅助命令", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) await removeTempDir(dir);
  });

  it("参数原样传递，标准输出和报错输出仍然可读", async () => {
    const argument = '中文 "带引号"\n下一行 & | %FLEET_LITERAL%';
    const result = await runBackgroundCommand(process.execPath, [
      "-e",
      'process.stdout.write(process.argv[1]); process.stderr.write("diagnostic");',
      argument,
    ]);
    expect(result).toEqual({ stdout: argument, stderr: "diagnostic" });
  });

  it("命令失败仍然返回退出码和报错，隐藏窗口不会吞掉失败", async () => {
    await expect(
      runBackgroundCommand(process.execPath, [
        "-e",
        'process.stderr.write("command failed"); process.exit(7);',
      ]),
    ).rejects.toMatchObject({ code: 7, stderr: "command failed" });
  });

  it.runIf(process.platform === "win32")(
    "由分离的后台进程启动 PowerShell 时，没有可见控制台",
    async () => {
      const dir = await createTempDir("fleet-hidden-command-");
      tempDirs.push(dir);
      const moduleUrl = new URL("../../src/process/backgroundCommand.ts", import.meta.url).href;
      const args = ["-NoProfile", "-NonInteractive", "-Command", CONSOLE_VISIBILITY_QUERY];
      // Node 24 直接加载仅含可擦除类型的模块；父进程按常驻服务同样的分离方式启动。
      const script = `
        const { runBackgroundCommand } = await import(${JSON.stringify(moduleUrl)});
        const result = await runBackgroundCommand("powershell", ${JSON.stringify(args)});
        process.stdout.write(result.stdout);
      `;
      const stdoutPath = join(dir, "out.log");
      const stderrPath = join(dir, "err.log");
      const child = await spawnWorker({
        command: { executable: process.execPath, prefixArgs: [], image: "node.exe" },
        args: ["--input-type=module", "--eval", script],
        cwd: dir,
        env: snapshotProcessEnv(),
        stdoutPath,
        stderrPath,
        files: [],
      });
      let exited = false;
      try {
        const exit = await new Promise<ProcessExitInfo>((resolve) => {
          child.onExit((info) => {
            exited = true;
            resolve(info);
          });
        });
        expect(exit.code, await readFile(stderrPath, "utf8")).toBe(0);
        expect((await readFile(stdoutPath, "utf8")).trim()).toBe("False");
      } finally {
        if (!exited) await killTree(child.pid);
      }
    },
  );
});
