/**
 * 集成测试的公共装配：真实的临时数据目录 + 写好的 config.json + 真实的 startDaemon(...)
 * （端口传 0），暴露发请求、重启、收尾的最小接口。测试文件只管调用 HTTP 接口断言行为，
 * 不用关心怎么拼装服务（任务书要求：通过 HTTP 接口验证，不碰服务内部）。
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startDaemon } from "../../../src/app/startDaemon.js";
import { buildTestConfig, type TestConfigOptions, writeTestConfig } from "./config.js";
import { killLeftoverFakeWorkers } from "./processCleanup.js";
import { createTempDir, removeTempDir } from "./tempDir.js";

// 本文件路径：packages/daemon/test/integration/support/harness.ts。
// 往上 5 级（support → integration → test → daemon → packages）就是仓库根目录，
// 和 src/main.ts 用 import.meta.url 定位仓库根目录是同一个算法。
const REPO_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

const FAKE_TRACE_ENV_VAR = "FLEET_FAKE_TRACE";

// 项目开了 noPropertyAccessFromIndexSignature，process.env 不能用点号读写字段；但方括号
// 配字符串字面量又会被 biome 的 useLiteralKeys 规则要求"简化"回点号，两条规则正好相反。
// 让 key 走一个变量（不是字面量）就能两边都满足，写法和 src/main.ts 的 readEnvVar 一致。
function readEnvVar(name: string): string | undefined {
  return process.env[name];
}

function writeEnvVar(name: string, value: string): void {
  process.env[name] = value;
}

function clearEnvVar(name: string): void {
  delete process.env[name];
}

export interface Harness {
  readonly home: string;
  /** 每个用例专属的假苦工轨迹文件（FLEET_FAKE_TRACE 指向它）。 */
  readonly traceFile: string;
  /** 默认已经建好的项目目录，大多数用例可以直接当 projectPath/cwd 用。 */
  readonly projectDir: string;
  port(): number;
  token(): string;
  /** 不需要令牌的只读接口。 */
  fetch(path: string, init?: RequestInit): Promise<Response>;
  /** 会改变状态的接口：自动带上 x-fleet-token。 */
  fetchWithToken(path: string, init?: RequestInit): Promise<Response>;
  /**
   * 只停当前这个服务进程内的引擎/HTTP，不清理假苦工、不删数据目录——重启接管的测试
   * 需要在「服务下线」和「重新起服务」之间插入一段真实等待（等苦工自己跑完），
   * 这段时间数据目录和残留进程都要保持原样。
   */
  stopDaemonOnly(): Promise<void>;
  /** 用同一个数据目录再起一个新服务（模拟重启接管）。 */
  startDaemonAgain(): Promise<void>;
  /** stopDaemonOnly + startDaemonAgain 的便捷写法，服务下线的间隔很短的场景用这个即可。 */
  restart(): Promise<void>;
  /** 停服务、结束所有残留的假苦工进程、还原环境变量、删临时目录。 */
  stop(): Promise<void>;
}

export async function startHarness(options: TestConfigOptions): Promise<Harness> {
  const home = await createTempDir("fleet-integration-");
  const projectDir = join(home, "project");
  await mkdir(projectDir, { recursive: true });

  const traceFile = join(home, "trace.jsonl");
  const previousTrace = readEnvVar(FAKE_TRACE_ENV_VAR);
  // 必须在 startDaemon 之前设置：服务拉起的苦工继承当前进程此刻的环境变量
  // （processHost.workerEnv() 只在第一次用到时取一次快照并缓存，见任务书写法要求）。
  writeEnvVar(FAKE_TRACE_ENV_VAR, traceFile);

  await writeTestConfig(home, buildTestConfig(options));

  let daemon = await startDaemon({ home, port: 0, repoRoot: REPO_ROOT, version: "test" });

  function baseUrl(): string {
    return `http://127.0.0.1:${daemon.port}`;
  }

  async function doFetch(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${baseUrl()}${path}`, init);
  }

  return {
    home,
    traceFile,
    projectDir,
    port: () => daemon.port,
    token: () => daemon.token,
    fetch: (path, init) => doFetch(path, init),
    fetchWithToken: (path, init = {}) =>
      doFetch(path, {
        ...init,
        headers: { ...init.headers, "x-fleet-token": daemon.token },
      }),
    async stopDaemonOnly(): Promise<void> {
      await daemon.stop();
    },
    async startDaemonAgain(): Promise<void> {
      daemon = await startDaemon({ home, port: 0, repoRoot: REPO_ROOT, version: "test" });
    },
    async restart(): Promise<void> {
      await daemon.stop();
      daemon = await startDaemon({ home, port: 0, repoRoot: REPO_ROOT, version: "test" });
    },
    async stop(): Promise<void> {
      await daemon.stop();
      await killLeftoverFakeWorkers(traceFile);
      if (previousTrace === undefined) {
        clearEnvVar(FAKE_TRACE_ENV_VAR);
      } else {
        writeEnvVar(FAKE_TRACE_ENV_VAR, previousTrace);
      }
      await removeTempDir(home);
    },
  };
}
