import { spawn } from "node:child_process";
import { COMMON_OPTIONS, parseCommandArgs } from "../args.js";
import type { CommandDeps } from "../context.js";
import { ensureDaemon } from "../daemon/discover.js";
import { CliUsageError, EXIT_CODE } from "../errors.js";
import { resolveHome } from "../home.js";

/**
 * 只保留「打开一个命令」这个动作作为可注入的依赖，而不是整个 child_process.spawn：
 * 真实的 spawn 返回值类型是一堆重载，为了在测试里塞一个假实现，抽出这个最小接口更省事，
 * 也避免测试真的弹出一个浏览器窗口。
 */
export type LaunchProcess = (command: string, args: readonly string[]) => void;

function defaultLaunch(command: string, args: readonly string[]): void {
  const child = spawn(command, [...args], { stdio: "ignore", detached: true, windowsHide: true });
  child.unref();
}

const OPEN_HELP = `用法：fleet open
用系统默认浏览器打开看板。

选项：
  --home <目录>     覆盖数据目录`;

/** 用系统默认浏览器打开看板（规格 3.4 open）：Windows 下用 rundll32，不经过 shell 拼命令。 */
export async function runOpenCommand(
  argv: readonly string[],
  deps: CommandDeps,
  launch: LaunchProcess = defaultLaunch,
): Promise<number> {
  const { values } = parseCommandArgs({ args: argv, options: { ...COMMON_OPTIONS } });
  if (values.help) {
    deps.io.stdout(OPEN_HELP);
    return EXIT_CODE.ok;
  }
  if (process.platform !== "win32") {
    throw new CliUsageError("fleet open 目前只支持 Windows");
  }

  const home = resolveHome(values.home, deps.env);
  const daemon = await ensureDaemon(home, deps.env);
  launch("rundll32", ["url.dll,FileProtocolHandler", daemon.baseUrl]);
  deps.io.stdout(`已打开 ${daemon.baseUrl}`);
  return EXIT_CODE.ok;
}
