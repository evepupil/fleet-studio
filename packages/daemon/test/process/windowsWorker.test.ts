import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { spawnWorker } from "../../src/process/spawnWorker.js";
import type { ProcessExitInfo } from "../../src/process/types.js";
import { snapshotProcessEnv } from "../../src/process/userEnv.js";
import { createTempDir, removeTempDir } from "./support/tempDir.js";

const CONSOLE_QUERY = `
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FleetWorkerConsole {
 [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
}
'@
[Console]::Write([FleetWorkerConsole]::IsWindowVisible([FleetWorkerConsole]::GetConsoleWindow()))
`;

it.runIf(process.platform === "win32")(
  "Node 苦工的同步、异步和 Promise 命令都不弹窗口，原有预载与子 Node 继承正常",
  async () => {
    const dir = await createTempDir("fleet-windows-worker-");
    const stdoutPath = join(dir, "out.log");
    const stderrPath = join(dir, "err.log");
    const marker = join(dir, "existing preload.mjs");
    const forkFile = join(dir, "fork.mjs");
    const workerFile = join(dir, "worker.mjs");
    const args = [
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(CONSOLE_QUERY, "utf16le").toString("base64"),
    ];
    const command = `powershell ${args.join(" ")}`;
    await writeFile(marker, 'process.env.FLEET_TEST_PRELOAD = "preserved";', "utf8");
    await writeFile(
      forkFile,
      `
      import { execFileSync } from "node:child_process";
      process.send({ visible: execFileSync("powershell", ${JSON.stringify(args)}, {encoding:"utf8"}).trim(), preload: process.env.FLEET_TEST_PRELOAD });
    `,
      "utf8",
    );
    const script = `
      import cp, {execFile,execFileSync,exec,execSync,spawn,spawnSync,fork} from "node:child_process";
      import {promisify} from "node:util";
      const args = ${JSON.stringify(args)};
      const result = {};
      const direct = spawn("powershell", args);
      let streamed = "";
      direct.stdout.setEncoding("utf8").on("data", text => streamed += text);
      await new Promise((resolve,reject) => {direct.once("error",reject); direct.once("close",code => code === 0 ? resolve() : reject(new Error("spawn failed")));});
      result.spawn = streamed.trim();
      result.spawnSync = spawnSync("powershell", args, {encoding:"utf8"}).stdout.trim();
      result.execFile = (await new Promise((resolve,reject) => execFile("powershell", args, (error,stdout) => error ? reject(error) : resolve(stdout)))).trim();
      const promised = promisify(execFile)("powershell", args);
      result.promiseChild = promised.child.pid > 0;
      result.execFilePromise = (await promised).stdout.trim();
      result.execFileSync = execFileSync("powershell", args, {encoding:"utf8"}).trim();
      result.execPromise = (await promisify(exec)(${JSON.stringify(command)})).stdout.trim();
      result.execSync = execSync(${JSON.stringify(command)}, {encoding:"utf8"}).trim();
      result.sameExports = cp.spawn === spawn;
      result.preload = process.env.FLEET_TEST_PRELOAD;
      const forked = fork(${JSON.stringify(forkFile)}, {silent:true});
      result.fork = await new Promise((resolve,reject) => {forked.once("error",reject); forked.once("message",resolve);});
      console.log(JSON.stringify(result));
    `;
    await writeFile(workerFile, script, "utf8");
    try {
      const child = await spawnWorker({
        command: { executable: process.execPath, prefixArgs: [], image: "node.exe" },
        args: [workerFile],
        cwd: dir,
        env: { ...snapshotProcessEnv(), NODE_OPTIONS: `--import=${pathToFileURL(marker).href}` },
        stdoutPath,
        stderrPath,
        files: [],
      });
      const exit = await new Promise<ProcessExitInfo>((resolveExit) => child.onExit(resolveExit));
      expect(exit.code, await readFile(stderrPath, "utf8")).toBe(0);
      expect(JSON.parse(await readFile(stdoutPath, "utf8"))).toEqual({
        spawn: "False",
        spawnSync: "False",
        execFile: "False",
        promiseChild: true,
        execFilePromise: "False",
        execFileSync: "False",
        execPromise: "False",
        execSync: "False",
        sameExports: true,
        preload: "preserved",
        fork: { visible: "False", preload: "preserved" },
      });
    } finally {
      await removeTempDir(dir);
    }
  },
  40000,
);
