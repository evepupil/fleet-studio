/**
 * 假进程托管：不真的拉起 pi / opencode，只在内存里记账，输出文件用真实临时文件——
 * 这样引擎里的 OutputTailer 依然是真实实现，跟生产环境读文件的路径完全一致。
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RuntimeId } from "@fleet/core";
import type {
  ProcessExitInfo,
  ProcessHost,
  ResolvedCommand,
  SpawnedProcess,
  SpawnRequest,
} from "../../../src/process/types.js";

export interface FakeSpawnedProcessInfo {
  pid: number;
  command: ResolvedCommand;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  stdoutPath: string;
  stderrPath: string;
  alive: boolean;
}

export interface FakeProcessHostOptions {
  /** kill() 是否自动触发 onExit，默认 true（贴近真实世界「杀了很快就退出」）。 */
  autoExitOnKill?: boolean;
  image?: string;
}

export interface FakeProcessHost extends ProcessHost {
  readonly spawnedProcesses: readonly FakeSpawnedProcessInfo[];
  readonly killedPids: readonly number[];
  readonly invalidateCallCount: number;
  /** 手动触发某个 pid 的退出：调用它注册的 onExit 回调（只会真正生效一次）。 */
  triggerExit(pid: number, exit: ProcessExitInfo): void;
  /** 直接改一个 pid 的存活状态，不经过 onExit——模拟接管场景下轮询 isAlive 发现的死活。 */
  setAlive(pid: number, alive: boolean): void;
  /** 登记一个「不是这次 spawn 出来的」既有进程，供接管场景使用。 */
  registerExistingProcess(pid: number, alive: boolean): void;
  failNextSpawn(error: Error): void;
  failNextResolve(error: Error): void;
  /** 让下一次 resolve() 永远不返回，用于测试评审 F5 的启动阶段超时保护。 */
  hangNextResolve(): void;
  /** 让下一次 spawn() 卡住，直到测试调用返回的 release()——用于测试「超时之后才迟到启动成功」。 */
  hangNextSpawn(): { release(): void };
}

interface Entry {
  alive: boolean;
  listeners: Array<(exit: ProcessExitInfo) => void>;
  exited: ProcessExitInfo | null;
}

export function createFakeProcessHost(options: FakeProcessHostOptions = {}): FakeProcessHost {
  const autoExitOnKill = options.autoExitOnKill ?? true;
  const image = options.image ?? "fake-runtime.exe";

  let nextPid = 1000;
  let invalidateCallCount = 0;
  let pendingSpawnError: Error | null = null;
  let pendingResolveError: Error | null = null;
  let resolveHangs = false;
  let pendingSpawnGate: Promise<void> | null = null;
  const killedPids: number[] = [];
  const spawned = new Map<number, FakeSpawnedProcessInfo>();
  const entries = new Map<number, Entry>();

  function entryOf(pid: number): Entry {
    const existing = entries.get(pid);
    if (existing !== undefined) {
      return existing;
    }
    const created: Entry = { alive: true, listeners: [], exited: null };
    entries.set(pid, created);
    return created;
  }

  function triggerExit(pid: number, exit: ProcessExitInfo): void {
    const entry = entryOf(pid);
    if (entry.exited !== null) {
      return; // 已经退出过一次，真实进程不会退出第二次
    }
    entry.exited = exit;
    entry.alive = false;
    const listeners = entry.listeners;
    entry.listeners = [];
    for (const listener of listeners) {
      listener(exit);
    }
  }

  return {
    get spawnedProcesses(): readonly FakeSpawnedProcessInfo[] {
      return [...spawned.values()];
    },
    killedPids,
    get invalidateCallCount(): number {
      return invalidateCallCount;
    },

    async resolve(runtime: RuntimeId): Promise<ResolvedCommand> {
      if (resolveHangs) {
        // 故意永远不 resolve/reject，模拟真的卡住；测试用假定时器把 launcher 的超时逼出来。
        return new Promise<ResolvedCommand>(() => {});
      }
      if (pendingResolveError !== null) {
        const error = pendingResolveError;
        pendingResolveError = null;
        throw error;
      }
      return { executable: `${runtime}-fake`, prefixArgs: [], image };
    },

    async spawn(request: SpawnRequest): Promise<SpawnedProcess> {
      if (pendingSpawnGate !== null) {
        const gate = pendingSpawnGate;
        pendingSpawnGate = null;
        await gate; // 卡在这里，直到测试调用 release()
      }
      if (pendingSpawnError !== null) {
        const error = pendingSpawnError;
        pendingSpawnError = null;
        throw error;
      }
      for (const file of request.files) {
        await mkdir(dirname(file.path), { recursive: true });
        await writeFile(file.path, file.content, "utf8");
      }
      await mkdir(dirname(request.stdoutPath), { recursive: true });
      await mkdir(dirname(request.stderrPath), { recursive: true });
      await writeFile(request.stdoutPath, "", "utf8");
      await writeFile(request.stderrPath, "", "utf8");

      const pid = nextPid;
      nextPid += 1;
      spawned.set(pid, {
        pid,
        command: request.command,
        args: request.args,
        cwd: request.cwd,
        env: request.env,
        stdoutPath: request.stdoutPath,
        stderrPath: request.stderrPath,
        alive: true,
      });
      const entry = entryOf(pid);

      return {
        pid,
        image,
        onExit(listener: (exit: ProcessExitInfo) => void): void {
          if (entry.exited !== null) {
            listener(entry.exited);
            return;
          }
          entry.listeners.push(listener);
        },
      };
    },

    async kill(pid: number): Promise<void> {
      killedPids.push(pid);
      if (autoExitOnKill) {
        triggerExit(pid, { code: null, signal: "SIGKILL" });
      }
      const info = spawned.get(pid);
      if (info !== undefined) {
        info.alive = entryOf(pid).alive;
      }
    },

    async isAlive(pid: number, imageParam: string | null): Promise<boolean> {
      if (imageParam !== null && imageParam.toLowerCase() !== image.toLowerCase()) {
        return false;
      }
      return entryOf(pid).alive;
    },

    async workerEnv(): Promise<Record<string, string>> {
      return {};
    },

    invalidate(): void {
      invalidateCallCount += 1;
    },

    triggerExit,

    setAlive(pid: number, alive: boolean): void {
      entryOf(pid).alive = alive;
      const info = spawned.get(pid);
      if (info !== undefined) {
        info.alive = alive;
      }
    },

    registerExistingProcess(pid: number, alive: boolean): void {
      entries.set(pid, { alive, listeners: [], exited: null });
    },

    failNextSpawn(error: Error): void {
      pendingSpawnError = error;
    },

    failNextResolve(error: Error): void {
      pendingResolveError = error;
    },

    hangNextResolve(): void {
      resolveHangs = true;
    },

    hangNextSpawn(): { release(): void } {
      let releaseFn: () => void = () => {};
      pendingSpawnGate = new Promise<void>((resolve) => {
        releaseFn = resolve;
      });
      return {
        release(): void {
          releaseFn();
        },
      };
    },
  };
}
