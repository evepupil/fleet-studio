import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API_PATHS } from "@fleet/core";
import { readEnv } from "../env.js";
import { CliConnectionError } from "../errors.js";
import { isRecord, readField } from "../json.js";

/**
 * daemon.json 的形状。故意不 import @fleet/daemon 的 DaemonInfo：命令行只依赖磁盘上这份
 * JSON 的契约，不依赖服务包的实现（服务包正在并行开发，类型可能还在变动）。字段含义见
 * 服务层的 DaemonPaths / DaemonInfo 契约（packages/daemon/src/app/types.ts）。
 */
export interface DaemonInfo {
  readonly pid: number;
  readonly port: number;
  readonly token: string;
  readonly startedAt: string;
  readonly version: string;
  readonly home: string;
}

export interface DaemonHandle {
  readonly baseUrl: string;
  readonly token: string;
  readonly info: DaemonInfo;
}

/** 读到的 JSON 不保证是这个形状（服务可能正在写文件、版本不匹配等），逐字段校验。 */
function isDaemonInfo(value: unknown): value is DaemonInfo {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof readField(value, "pid") === "number" &&
    typeof readField(value, "port") === "number" &&
    typeof readField(value, "token") === "string" &&
    typeof readField(value, "startedAt") === "string" &&
    typeof readField(value, "version") === "string" &&
    typeof readField(value, "home") === "string"
  );
}

function daemonInfoPath(home: string): string {
  return resolve(home, "daemon.json");
}

/** 只用来拼进「服务启动失败」提示里，命令行本身不读这个文件。 */
export function daemonLogPath(home: string): string {
  return resolve(home, "daemon.log");
}

async function readDaemonInfoFile(home: string): Promise<DaemonInfo | null> {
  try {
    const text = await readFile(daemonInfoPath(home), "utf8");
    const data: unknown = JSON.parse(text);
    return isDaemonInfo(data) ? data : null;
  } catch {
    // 文件不存在、正在被写入到一半、内容不是合法 JSON：都当作「还没有可用的服务」。
    return null;
  }
}

/** 探活超时固定 1 秒（规格 3.2.1）：本机服务，1 秒内没响应基本等同没起来。 */
const HEALTH_PROBE_TIMEOUT_MS = 1000;

async function probeHealth(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${API_PATHS.health}`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 读文件 + 探活一起做；两步都过才认为服务真的可用。daemon status / stop 也用它，且不触发拉起。 */
export async function findRunningDaemon(home: string): Promise<DaemonHandle | null> {
  const info = await readDaemonInfoFile(home);
  if (info === null) {
    return null;
  }
  const baseUrl = `http://127.0.0.1:${info.port}`;
  const healthy = await probeHealth(baseUrl, HEALTH_PROBE_TIMEOUT_MS);
  return healthy ? { baseUrl, token: info.token, info } : null;
}

/**
 * daemon 入口的默认路径：本文件编译后落在 packages/cli/dist/daemon/discover.js，
 * 它的上一级就是规格里说的「packages/cli/dist/」；从那里再往上两级到 packages/，
 * 平级进 daemon 包拿它编译产物的入口，即 packages/daemon/dist/main.js。
 *
 * 环境变量 FLEET_DAEMON_ENTRY 可以整体覆盖这条路径——单测就是靠它指向一个假服务脚本
 * （按 --home 写出 daemon.json 再起一个桩 HTTP 服务），不必真的构建 daemon 包才能测
 * ensureDaemon 的拉起逻辑。
 */
function resolveDaemonEntry(env: NodeJS.ProcessEnv): string {
  const override = readEnv(env, "FLEET_DAEMON_ENTRY");
  if (override !== undefined && override.length > 0) {
    return override;
  }
  const cliDistDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  return resolve(cliDistDir, "..", "..", "daemon", "dist", "main.js");
}

/** 拉起服务后最多等这么久（毫秒），每隔 POLL_INTERVAL_MS 读一次文件加探活（规格 3.2.3）。 */
const ENSURE_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

/**
 * 找到或拉起服务：先看 daemon.json + 探活；不通就 spawn 一个新进程再轮询，直到探活成功
 * 或超过 8 秒。daemon stop / status 不应该调用这个函数（它们要的是「不存在就是不存在」），
 * 应该直接用 findRunningDaemon。
 */
export async function ensureDaemon(home: string, env: NodeJS.ProcessEnv): Promise<DaemonHandle> {
  const existing = await findRunningDaemon(home);
  if (existing !== null) {
    return existing;
  }

  const entry = resolveDaemonEntry(env);
  const child = spawn(process.execPath, [entry, "--home", home], {
    detached: true,
    windowsHide: true,
    stdio: "ignore",
  });
  child.unref();

  const deadline = Date.now() + ENSURE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS);
    const found = await findRunningDaemon(home);
    if (found !== null) {
      return found;
    }
  }
  throw new CliConnectionError(`服务启动失败，日志在 ${daemonLogPath(home)}`);
}
