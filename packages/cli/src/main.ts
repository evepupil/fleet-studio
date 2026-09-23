import process from "node:process";
import { pathToFileURL } from "node:url";
import { FleetApiError } from "./client.js";
import { runCancelCommand } from "./commands/cancel.js";
import { runDaemonCommand } from "./commands/daemon.js";
import { runLogCommand } from "./commands/log.js";
import { runOpenCommand } from "./commands/open.js";
import { runPoolCommand } from "./commands/pool.js";
import { runPoolsCommand } from "./commands/pools.js";
import { runPsCommand } from "./commands/ps.js";
import { runRolesCommand } from "./commands/roles.js";
import { runRunCommand } from "./commands/run.js";
import { runSendCommand } from "./commands/send.js";
import { runShowCommand } from "./commands/show.js";
import { runWaitCommand } from "./commands/wait.js";
import type { CommandDeps } from "./context.js";
import { CliConnectionError, CliUsageError, EXIT_CODE, type ExitCode } from "./errors.js";
import { type CliIo, createProcessIo } from "./io.js";

const GLOBAL_HELP = `用法：fleet <子命令> [参数...]

子命令：
  run       派一个苦工
  wait      等苦工结束
  ps        列出苦工
  show      看一个苦工的详情
  log       看一个苦工的时间线
  send      续接一个苦工
  cancel    取消苦工
  pools     列出模型池
  pool      调整模型池配置（pool set）
  roles     列出角色
  daemon    管理本机服务（start / stop / status / restart）
  open      打开看板

每个子命令都支持 --help 查看详细用法，--json 原样输出接口返回的 JSON。`;

type CommandHandler = (argv: readonly string[], deps: CommandDeps) => Promise<number>;

const COMMANDS: Readonly<Record<string, CommandHandler>> = {
  run: runRunCommand,
  wait: runWaitCommand,
  ps: runPsCommand,
  show: runShowCommand,
  log: runLogCommand,
  send: runSendCommand,
  cancel: runCancelCommand,
  pools: runPoolsCommand,
  pool: runPoolCommand,
  roles: runRolesCommand,
  daemon: runDaemonCommand,
  open: runOpenCommand,
};

/**
 * 把子命令执行过程中抛出的异常统一映射成退出码（规格 3.1）：
 * 用法错误、连不上服务都是 3；接口返回的结构化错误是业务失败，1；
 * 其余没预料到的异常也按业务失败处理，不让命令行直接崩栈给用户看堆栈。
 */
function reportError(error: unknown, io: CliIo): ExitCode {
  if (error instanceof CliUsageError) {
    io.stderr(error.message);
    return EXIT_CODE.usage;
  }
  if (error instanceof CliConnectionError) {
    io.stderr(error.message);
    return EXIT_CODE.usage;
  }
  if (error instanceof FleetApiError) {
    io.stderr(`错误：${error.message}`);
    return EXIT_CODE.failure;
  }
  io.stderr(`意外错误：${error instanceof Error ? error.message : String(error)}`);
  return EXIT_CODE.failure;
}

/**
 * 命令行的统一入口：解析子命令名、组装运行环境、分发、兜底捕获异常。
 * overrides 让测试可以注入假的 io / stdin / cwd / now，不用真的碰 process 全局对象或网络。
 */
export async function runFleetCli(
  argv: readonly string[],
  overrides: Partial<CommandDeps> = {},
): Promise<number> {
  const deps: CommandDeps = {
    io: overrides.io ?? createProcessIo(),
    env: overrides.env ?? process.env,
    cwd: overrides.cwd ?? process.cwd(),
    stdin: overrides.stdin ?? process.stdin,
    now: overrides.now ?? (() => new Date()),
  };

  const [command, ...rest] = argv;

  if (command === "--help" || command === "help") {
    deps.io.stdout(GLOBAL_HELP);
    return EXIT_CODE.ok;
  }
  if (command === undefined) {
    deps.io.stderr("用法错误：请提供子命令");
    deps.io.stderr(GLOBAL_HELP);
    return EXIT_CODE.usage;
  }

  const handler = COMMANDS[command];
  if (handler === undefined) {
    deps.io.stderr(`未知的子命令：${command}`);
    deps.io.stderr(GLOBAL_HELP);
    return EXIT_CODE.usage;
  }

  try {
    return await handler(rest, deps);
  } catch (error) {
    return reportError(error, deps.io);
  }
}

/** 是否被直接执行（`node dist/main.js ...`），而不是被别的模块 import。 */
function isDirectlyExecuted(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirectlyExecuted()) {
  const exitCode = await runFleetCli(process.argv.slice(2));
  process.exit(exitCode);
}
