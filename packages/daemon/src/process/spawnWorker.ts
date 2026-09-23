/**
 * 分离启动苦工进程：输出直接写文件、stdin 关闭、spawn 成功后立刻 unref。
 * 分离的用意是服务重启/崩溃不连带杀死苦工，重启后还能接管（模块设计第 3.3 节）。
 */

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import type { Stats } from "node:fs";
import { closeSync, openSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { FleetError } from "@fleet/core";
import type { ProcessExitInfo, SpawnedProcess, SpawnRequest } from "./types.js";

export async function spawnWorker(request: SpawnRequest): Promise<SpawnedProcess> {
  await ensureCwdIsDirectory(request.cwd);
  for (const file of request.files) {
    await ensureParentDir(file.path);
    await writeFile(file.path, file.content, "utf8");
  }
  await ensureParentDir(request.stdoutPath);
  await ensureParentDir(request.stderrPath);

  // 以追加方式打开，拿到文件描述符直接交给 spawn；子进程继承之后父进程这边就用不上了。
  const outFd = openSync(request.stdoutPath, "a");
  const errFd = openSync(request.stderrPath, "a");

  const { command } = request;
  const child = spawn(command.executable, [...command.prefixArgs, ...request.args], {
    cwd: request.cwd,
    env: request.env,
    detached: true,
    windowsHide: true,
    // stdin 必须是 ignore：pi、opencode 在非 TTY stdin 不给 EOF 时都会永久卡住
    // （docs/调研/pi-运行时.md 第 6 节、docs/调研/opencode-运行时.md 第 6.1 节）。
    // 不用 shell，参数原样进 argv，不会被 cmd.exe 在第一个换行处截断。
    stdio: ["ignore", outFd, errFd],
  });

  closeSync(outFd);
  closeSync(errFd);

  return waitForSpawnResult(child, command.image);
}

/** 拿到 pid 才算启动成功：'spawn' 和 'error' 互斥，只会触发其中一个。 */
function waitForSpawnResult(child: ChildProcess, image: string): Promise<SpawnedProcess> {
  return new Promise((resolve, reject) => {
    child.once("error", (error) => {
      reject(new FleetError("runtime_unavailable", `启动失败：${describeError(error)}`));
    });
    child.once("spawn", () => {
      child.unref();
      resolve(createSpawnedProcess(child, image));
    });
  });
}

function createSpawnedProcess(child: ChildProcess, image: string): SpawnedProcess {
  const pid = child.pid;
  if (pid === undefined) {
    // 理论上走不到这里：'spawn' 事件触发时 child.pid 必然已经赋值，这里只是让类型收窄。
    throw new FleetError("runtime_unavailable", "启动失败：未能获取进程号");
  }

  let cachedExit: ProcessExitInfo | null = null;
  const pendingListeners = new Set<(exit: ProcessExitInfo) => void>();

  child.once("exit", (code, signal) => {
    const exit: ProcessExitInfo = { code, signal };
    cachedExit = exit;
    for (const listener of pendingListeners) {
      listener(exit);
    }
    pendingListeners.clear();
  });

  return {
    pid,
    image,
    onExit(listener: (exit: ProcessExitInfo) => void): void {
      // 监听者可能在进程已经退出之后才注册，这时要把缓存的退出信息立刻回放给它。
      if (cachedExit !== null) {
        listener(cachedExit);
        return;
      }
      pendingListeners.add(listener);
    },
  };
}

async function ensureCwdIsDirectory(cwd: string): Promise<void> {
  let stats: Stats;
  try {
    stats = await stat(cwd);
  } catch {
    throw new FleetError("invalid_request", `工作目录不存在：${cwd}`);
  }
  if (!stats.isDirectory()) {
    throw new FleetError("invalid_request", `工作目录不存在：${cwd}`);
  }
}

async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
