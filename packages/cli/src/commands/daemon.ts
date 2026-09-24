import { API_PATHS } from "@fleet/core";
import { COMMON_OPTIONS, parseCommandArgs } from "../args.js";
import { createFleetClient } from "../client.js";
import type { CommandDeps } from "../context.js";
import {
  type DaemonInfo,
  daemonLogPath,
  ensureDaemon,
  findRunningDaemon,
} from "../daemon/discover.js";
import { CliUsageError, EXIT_CODE } from "../errors.js";
import { resolveHome } from "../home.js";

const DAEMON_HELP = `用法：fleet daemon <start|stop|status|restart> [--json]
管理本机的闸门服务。

选项：
  --json           原样输出状态信息
  --home <目录>     覆盖数据目录`;

/** 不包含 token：daemon.json 里的令牌是本机凭证，任何展示场景都不应该打印出来。 */
interface DaemonStatusView {
  readonly running: boolean;
  readonly pid?: number;
  readonly port?: number;
  readonly startedAt?: string;
  readonly home?: string;
  readonly version?: string;
}

function toStatusView(info: DaemonInfo | null): DaemonStatusView {
  if (info === null) {
    return { running: false };
  }
  return {
    running: true,
    pid: info.pid,
    port: info.port,
    startedAt: info.startedAt,
    home: info.home,
    version: info.version,
  };
}

function printStatusLines(deps: CommandDeps, info: DaemonInfo): void {
  deps.io.stdout(`进程号：${info.pid}`);
  deps.io.stdout(`端口：${info.port}`);
  deps.io.stdout(`启动时间：${info.startedAt}`);
  deps.io.stdout(`数据目录：${info.home}`);
  deps.io.stdout(`版本：${info.version}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

/** 关停接口只是通知服务收尾；这里再自己等到端口探活失败，确认真的停了（规格 3.4 daemon stop）。 */
const STOP_TIMEOUT_MS = 8000;
const STOP_POLL_INTERVAL_MS = 200;

async function waitUntilStopped(home: string): Promise<boolean> {
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const still = await findRunningDaemon(home);
    if (still === null) {
      return true;
    }
    await delay(STOP_POLL_INTERVAL_MS);
  }
  return false;
}

async function runStatus(deps: CommandDeps, home: string, wantsJson: boolean): Promise<number> {
  const handle = await findRunningDaemon(home);
  if (wantsJson) {
    deps.io.stdout(JSON.stringify(toStatusView(handle?.info ?? null), null, 2));
    return EXIT_CODE.ok;
  }
  if (handle === null) {
    deps.io.stdout("服务未运行");
    return EXIT_CODE.ok;
  }
  printStatusLines(deps, handle.info);
  return EXIT_CODE.ok;
}

/** start / status 都不触发自动拉起，只有 start 需要真的拉起（规格 3.2.4）。 */
async function runStart(deps: CommandDeps, home: string, wantsJson: boolean): Promise<number> {
  const before = await findRunningDaemon(home);
  const handle = await ensureDaemon(home, deps.env);
  if (!wantsJson) {
    deps.io.stdout(before !== null ? "服务已在运行" : "服务已启动");
    printStatusLines(deps, handle.info);
    return EXIT_CODE.ok;
  }
  deps.io.stdout(JSON.stringify(toStatusView(handle.info), null, 2));
  return EXIT_CODE.ok;
}

async function runStop(deps: CommandDeps, home: string, wantsJson: boolean): Promise<number> {
  const handle = await findRunningDaemon(home);
  if (handle === null) {
    if (wantsJson) {
      deps.io.stdout(JSON.stringify({ stopped: true, wasRunning: false }, null, 2));
    } else {
      deps.io.stdout("服务未运行");
    }
    return EXIT_CODE.ok;
  }

  const client = createFleetClient(handle.baseUrl, handle.token);
  await client.postEmpty<{ ok: boolean }>(API_PATHS.shutdown);
  const stopped = await waitUntilStopped(home);

  if (!stopped) {
    deps.io.stderr(`服务在等待期间没有停止，日志在 ${daemonLogPath(home)}`);
    return EXIT_CODE.failure;
  }
  if (wantsJson) {
    deps.io.stdout(JSON.stringify({ stopped: true, wasRunning: true }, null, 2));
  } else {
    deps.io.stdout("服务已停止");
  }
  return EXIT_CODE.ok;
}

async function runRestart(deps: CommandDeps, home: string, wantsJson: boolean): Promise<number> {
  const handle = await findRunningDaemon(home);
  if (handle !== null) {
    const client = createFleetClient(handle.baseUrl, handle.token);
    await client.postEmpty<{ ok: boolean }>(API_PATHS.shutdown);
    const stopped = await waitUntilStopped(home);
    if (!stopped) {
      deps.io.stderr(`服务在等待期间没有停止，日志在 ${daemonLogPath(home)}`);
      return EXIT_CODE.failure;
    }
  }
  // findRunningDaemon 此时必为 null（文件没了，或探活已经失败），ensureDaemon 会真的重新拉起一次。
  const restarted = await ensureDaemon(home, deps.env);
  if (wantsJson) {
    deps.io.stdout(JSON.stringify(toStatusView(restarted.info), null, 2));
  } else {
    deps.io.stdout("服务已重启");
    printStatusLines(deps, restarted.info);
  }
  return EXIT_CODE.ok;
}

export async function runDaemonCommand(
  argv: readonly string[],
  deps: CommandDeps,
): Promise<number> {
  // `fleet daemon --help` 这种把选项写在最前面的，第一个参数就不是子命令，整串交给选项解析
  const [first, ...others] = argv;
  const sub = first === undefined || first.startsWith("-") ? undefined : first;
  const rest = sub === undefined ? argv : others;
  const { values } = parseCommandArgs({ args: [...rest], options: { ...COMMON_OPTIONS } });

  if (values.help) {
    deps.io.stdout(DAEMON_HELP);
    return EXIT_CODE.ok;
  }
  if (sub === undefined) {
    throw new CliUsageError("请给出 daemon 的子命令：start / stop / status / restart");
  }

  const home = resolveHome(values.home, deps.env);
  const wantsJson = values.json === true;
  switch (sub) {
    case "start":
      return runStart(deps, home, wantsJson);
    case "stop":
      return runStop(deps, home, wantsJson);
    case "status":
      return runStatus(deps, home, wantsJson);
    case "restart":
      return runRestart(deps, home, wantsJson);
    default:
      throw new CliUsageError(`未知的 daemon 子命令：${sub}`);
  }
}
