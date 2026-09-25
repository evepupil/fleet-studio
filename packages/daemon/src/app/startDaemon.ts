/**
 * 把配置、存储、进程托管、调度引擎、HTTP 接口装配成一个常驻服务（模块设计《服务层-
 * 调度引擎》4.3 节）。调度引擎（engine/engine.ts）由另一路并行开发；这里按规格 3.1 节
 * 给出的 createEngine(deps): Engine 签名直接导入使用，不等它写完。
 */
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { API_PATHS, FleetError } from "@fleet/core";
import { openConfigStore } from "../config/configStore.js";
import { createEngine } from "../engine/engine.js";
import {
  createHttpApp,
  type HttpApp,
  type HttpServerHandle,
  startHttpServer,
} from "../http/index.js";
import { createProcessHost, isProcessAlive } from "../process/index.js";
import { createRepos } from "../store/index.js";
import { readDaemonInfo, removeDaemonInfoIfOwned, writeDaemonInfo } from "./daemonInfo.js";
import { createFileLogger } from "./logger.js";
import { resolveDaemonPaths } from "./paths.js";
import type { DaemonPaths } from "./types.js";

export interface StartDaemonOptions {
  home: string;
  /** 不传用配置里的端口；测试传 0 让系统分配。 */
  port?: number;
  repoRoot: string;
  /** 看板构建产物目录，默认 <repoRoot>/apps/web/dist。 */
  webDistDir?: string;
  version: string;
}

export interface DaemonHandle {
  readonly port: number;
  readonly token: string;
  readonly home: string;
  /** 依次停引擎、关 HTTP、关数据库、关配置，删掉自己写的 daemon.json；可重复调用。 */
  stop(): Promise<void>;
  /**
   * HTTP /api/shutdown 被调用时触发；main.ts 借它和 SIGINT/SIGTERM 走同一条退出路径。
   * 模块设计给出的 DaemonHandle 只有 port/token/home/stop，这里补的这个方法是装配层
   * 自己需要的最小扩展：没有它 main.ts 就没有办法知道"接口层收到了退出请求"这件事。
   */
  onShutdownRequested(listener: () => void): () => void;
}

const HEALTH_PROBE_TIMEOUT_MS = 1000;

async function probeHealth(port: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`http://127.0.0.1:${port}${API_PATHS.health}`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 三个条件都满足才算真的冲突：daemon.json 存在、进程号还活着、且 /api/health 能通。 */
async function ensureNoOtherInstanceRunning(paths: DaemonPaths): Promise<void> {
  const info = await readDaemonInfo(paths.daemonInfoFile);
  if (info === null) {
    return;
  }
  if (!(await isProcessAlive(info.pid, null))) {
    return; // daemon.json 是残留的，进程已经不在了
  }
  if (!(await probeHealth(info.port))) {
    return; // 进程号活着但接口不通，不当作可用的服务
  }
  throw new FleetError("conflict", `服务已在运行（端口 ${info.port}）`);
}

/** Error 本身没有声明 code 字段，用 in narrowing 而不是断言安全读它（跟 process 层同一个写法）。 */
function errnoCode(error: unknown): unknown {
  return error instanceof Error && "code" in error ? error.code : undefined;
}

async function bindHttpServer(app: HttpApp, port: number): Promise<HttpServerHandle> {
  try {
    return await startHttpServer(app, port);
  } catch (error) {
    if (errnoCode(error) === "EADDRINUSE") {
      throw new FleetError("conflict", `端口 ${port} 被占用`);
    }
    throw error;
  }
}

export async function startDaemon(options: StartDaemonOptions): Promise<DaemonHandle> {
  const paths = resolveDaemonPaths(options.home);
  await mkdir(paths.home, { recursive: true });
  await mkdir(paths.runsDir, { recursive: true });
  const logger = createFileLogger(paths.logFile);

  await ensureNoOtherInstanceRunning(paths);

  const config = openConfigStore(paths.configFile, logger);
  const repos = createRepos(paths.dbFile, paths.dbBackupsDir);

  // 装配到一半失败时，catch 需要知道具体走到哪一步：引擎建好、HTTP 真正监听之后才
  // 分别赋值，失败时按"已经创建成功的部分"清理，避免 HTTP 还在监听、daemon.json 还留着，
  // 导致同一进程里再次 startDaemon 被单实例检测误判成"服务已在运行"。
  let engine: ReturnType<typeof createEngine> | null = null;
  let httpHandle: HttpServerHandle | null = null;

  try {
    const host = createProcessHost({ getConfig: () => config.current(), logger });
    const version = options.version;
    const startedAt = new Date().toISOString();
    const webDistDir = options.webDistDir ?? join(options.repoRoot, "apps", "web", "dist");
    const token = randomBytes(24).toString("hex");
    const dashboardToken = randomBytes(24).toString("hex");

    // 端口要等 HTTP 真正监听后才知道（尤其是传 0 由系统分配时），引擎和接口层都只拿一个
    // 读取回调，实际值在 bindHttpServer 之后才写进这个闭包变量。
    let actualPort = 0;
    const getPort = (): number => actualPort;
    const shutdownListeners = new Set<() => void>();

    engine = createEngine({
      repos,
      host,
      config,
      paths,
      logger,
      version,
      startedAt,
      getPort,
      platform: process.platform === "win32" ? "win32" : "posix",
      homeDir: homedir(),
      builtinRoot: options.repoRoot,
      onShutdownRequested: () => {
        for (const listener of shutdownListeners) {
          listener();
        }
      },
    });

    const app = createHttpApp({
      service: engine,
      token,
      dashboardToken,
      getPort,
      webDistDir,
      logger,
    });

    const requestedPort = options.port ?? config.current().port;
    httpHandle = await bindHttpServer(app, requestedPort);
    actualPort = httpHandle.port;

    await writeDaemonInfo(paths.daemonInfoFile, {
      pid: process.pid,
      port: actualPort,
      token,
      startedAt,
      version,
      home: paths.home,
    });

    await engine.start();

    let stopPromise: Promise<void> | null = null;
    async function performStop(): Promise<void> {
      // engine/httpHandle 在闭包里被当作可能为 null 的类型（供失败清理复用同一对变量），
      // 但 performStop 只会通过下面返回的 stop() 调用，届时两者必然已经赋值成功。
      await engine?.stop();
      await httpHandle?.close();
      repos.close();
      config.close();
      await removeDaemonInfoIfOwned(paths.daemonInfoFile, process.pid);
    }
    function stop(): Promise<void> {
      if (stopPromise === null) {
        stopPromise = performStop();
      }
      return stopPromise;
    }

    return {
      port: actualPort,
      token,
      home: paths.home,
      stop,
      onShutdownRequested(listener: () => void): () => void {
        shutdownListeners.add(listener);
        return () => shutdownListeners.delete(listener);
      },
    };
  } catch (error) {
    // 按"引擎停止（如已创建）→ HTTP 关闭（如已监听）→ 删自己写的 daemon.json（如已写）→
    // 数据库关闭 → 配置关闭"顺序清理已经装配成功的部分；每一步单独兜住异常，不让某一步
    // 的清理失败连带影响后面几步，最后抛出的是原始错误，不是清理过程里的错误。
    if (engine !== null) {
      try {
        await engine.stop();
      } catch (cleanupError) {
        logger.error("装配失败后停引擎出错", cleanupError);
      }
    }
    if (httpHandle !== null) {
      try {
        await httpHandle.close();
      } catch (cleanupError) {
        logger.error("装配失败后关 HTTP 出错", cleanupError);
      }
    }
    try {
      await removeDaemonInfoIfOwned(paths.daemonInfoFile, process.pid);
    } catch (cleanupError) {
      logger.error("装配失败后删 daemon.json 出错", cleanupError);
    }
    try {
      repos.close();
    } catch (cleanupError) {
      logger.error("装配失败后关数据库出错", cleanupError);
    }
    try {
      config.close();
    } catch (cleanupError) {
      logger.error("装配失败后关配置出错", cleanupError);
    }
    throw error;
  }
}
