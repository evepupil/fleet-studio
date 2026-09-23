/**
 * 服务进程入口（模块设计《服务层-调度引擎》4.4 节）：解析参数、装配并启动服务、接住
 * 信号和退出请求、兜底记录未捕获异常。构建后落在 packages/daemon/dist/main.js。
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createFileLogger } from "./app/logger.js";
import { resolveDaemonPaths } from "./app/paths.js";
import { startDaemon } from "./app/startDaemon.js";
import type { Logger } from "./app/types.js";

/** 项目开了 noPropertyAccessFromIndexSignature，process.env 不能用点号读字段。 */
function readEnvVar(name: string): string | undefined {
  return process.env[name];
}

/** 数据目录优先级：--home > 环境变量 FLEET_HOME > ~/.fleet-studio。 */
function resolveHome(cliHome: string | undefined): string {
  const raw = cliHome ?? readEnvVar("FLEET_HOME") ?? join(homedir(), ".fleet-studio");
  return resolve(raw);
}

/** --port 只在明确传了才校验；不传就交给服务用配置里的端口。 */
function parsePort(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`--port 参数不是合法端口号：${raw}`);
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 项目开了 noPropertyAccessFromIndexSignature，Record<string, unknown> 不能用点号读字段。 */
function readUnknownField(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

/** 版本取 packages/daemon/package.json：daemon.json 和 /api/health 都要报给命令行看。 */
function readPackageVersion(packageJsonPath: string): string {
  const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const version = isRecord(parsed) ? readUnknownField(parsed, "version") : undefined;
  if (typeof version !== "string") {
    throw new Error(`包信息缺少版本号：${packageJsonPath}`);
  }
  return version;
}

/** 日志可能还没建好（比如参数解析就失败了），这种情况下退回 console，好歹留个痕迹。 */
function reportFatal(logger: Logger | null, message: string, error: unknown): void {
  if (logger !== null) {
    logger.error(message, error);
  } else {
    console.error(message, error);
  }
}

async function main(): Promise<void> {
  let logger: Logger | null = null;

  process.on("uncaughtException", (error: unknown) => {
    reportFatal(logger, "未捕获异常", error);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason: unknown) => {
    reportFatal(logger, "未处理的 Promise 拒绝", reason);
    process.exit(1);
  });

  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: { home: { type: "string" }, port: { type: "string" } },
    });

    const home = resolveHome(values.home);
    const paths = resolveDaemonPaths(home);
    logger = createFileLogger(paths.logFile);

    const port = parsePort(values.port);
    const distDir = dirname(fileURLToPath(import.meta.url));
    // dist/main.js 往上三级（dist → daemon → packages）就是仓库根目录。
    const repoRoot = resolve(distDir, "..", "..", "..");
    const version = readPackageVersion(join(distDir, "..", "package.json"));

    const handle = await startDaemon({
      home,
      repoRoot,
      version,
      ...(port !== undefined ? { port } : {}),
    });

    let stopping = false;
    async function shutdown(exitCode: number): Promise<void> {
      if (stopping) {
        return;
      }
      stopping = true;
      await handle.stop();
      process.exit(exitCode);
    }

    process.on("SIGINT", () => {
      void shutdown(0);
    });
    process.on("SIGTERM", () => {
      void shutdown(0);
    });
    handle.onShutdownRequested(() => {
      void shutdown(0);
    });
  } catch (error) {
    reportFatal(logger, "服务启动失败", error);
    process.exit(1);
  }
}

void main();
