/**
 * 假苦工进程测试的共用小工具：spawn、收集输出、按条件读到指定行数、结束整棵进程树。
 * 抽出来是因为 fake-pi 和 fake-opencode 的测试要做的事完全一样，只是脚本和事件格式不同。
 */

import type { ChildProcess, ChildProcessByStdio } from "node:child_process";
import { execFileSync, spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";

/** 假苦工总是 stdin 'ignore'、stdout/stderr 'pipe'——测试要读输出，不需要交互输入。 */
export type FakeChild = ChildProcessByStdio<null, Readable, Readable>;

/** 只有「stdin 不关闭会卡住」这一个用例需要真的留一个能写、能关的 stdin 管道。 */
export type FakeChildWithStdin = ChildProcessByStdio<Writable, Readable, Readable>;

function resolveExe(command: readonly string[]): string {
  const exe = command[0];
  if (exe === undefined) {
    throw new Error("command 不能是空数组");
  }
  return exe;
}

/** command 是 fakePiCommand()/fakeOpencodeCommand() 的返回值：[可执行文件, 脚本路径]。 */
export function spawnFake(
  command: readonly string[],
  args: readonly string[],
  env?: Readonly<Record<string, string>>,
): FakeChild {
  return spawn(resolveExe(command), [...command.slice(1), ...args], {
    stdio: ["ignore", "pipe", "pipe"],
    env: env === undefined ? process.env : { ...process.env, ...env },
  });
}

/**
 * 专给「stdin 不关闭会卡住」这个用例用：stdin 留成真正的管道、不写也不关，
 * 用来验证假苦工是不是真的模仿了真实 pi/opencode「先读完 stdin 才往下走」的行为。
 */
export function spawnFakeWithOpenStdin(
  command: readonly string[],
  args: readonly string[],
): FakeChildWithStdin {
  return spawn(resolveExe(command), [...command.slice(1), ...args], {
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export interface FakeRunResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
}

function collectText(stream: Readable): () => string {
  let text = "";
  stream.on("data", (chunk: Buffer) => {
    text += chunk.toString("utf8");
  });
  return () => text;
}

/** 等这个进程自己跑完（success / model-error / no-key / crash 都会自己退出）。 */
export function runToCompletion(child: FakeChild): Promise<FakeRunResult> {
  const readStdout = collectText(child.stdout);
  const readStderr = collectText(child.stderr);
  return new Promise((resolve) => {
    child.on("close", (exitCode, signal) => {
      resolve({ stdout: readStdout(), stderr: readStderr(), exitCode, signal });
    });
  });
}

/** 按换行切行，丢掉空行。 */
export function toLines(text: string): string[] {
  return text.split("\n").filter((line) => line.trim().length > 0);
}

/**
 * 一行一行读 stdout，直到 predicate 认可当前已收到的所有行为止，或者等超过 timeoutMs
 * 还没等到就判失败——用来测 hang / retry-storm 这类永不主动退出的剧本：
 * 读到「够用的证据」就收手，不必等进程自己结束（它也不会结束）。
 */
export function readLinesUntil(
  child: FakeChild,
  predicate: (lines: readonly string[]) => boolean,
  timeoutMs: number,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];
    let buffer = "";

    const timer = setTimeout(() => {
      child.stdout.off("data", onData);
      reject(new Error(`等了 ${timeoutMs}ms 还没等到期望的输出，目前收到 ${lines.length} 行`));
    }, timeoutMs);

    function onData(chunk: Buffer): void {
      buffer += chunk.toString("utf8");
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (part.trim().length > 0) {
          lines.push(part);
        }
      }
      if (predicate(lines)) {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        resolve(lines);
      }
    }

    child.stdout.on("data", onData);
  });
}

/**
 * 结束整棵进程树并等到 Node 确认它已经退出。Windows 上普通 kill 杀不掉孙进程
 * （spawn-child-hang 剧本要测的正是这个），必须用 `taskkill /T /F` 连子进程一起杀
 * （见 docs/调研/opencode-运行时.md 第 5.2 节的结论）。
 */
export async function killAndWait(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (pid !== undefined) {
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        // 进程可能已经自己退出了；taskkill 找不到目标会非零退出，这里不算测试失败。
      }
    } else {
      child.kill("SIGKILL");
    }
  }
  await waitForClose(child);
}

function waitForClose(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once("close", () => resolve());
  });
}

/**
 * 等 ms 毫秒，看进程是不是还活着（没有触发 close）——用来确认 hang 类剧本
 * 真的卡住了，不是刚好慢了一点点正常退出。
 */
export function stillRunningAfter(child: ChildProcess, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(true), ms);
    child.once("close", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}
