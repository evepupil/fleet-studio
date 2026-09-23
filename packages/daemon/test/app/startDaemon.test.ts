/**
 * startDaemon 组装测试（模块设计《服务层-调度引擎》4.3 节）：正常启动到停止的整条生命
 * 周期、单实例冲突检测，以及本次修的缺陷——装配到一半失败时，已经真正监听的 HTTP 端口
 * 必须被关掉，不能留着一直响应，也不能让同一进程里的下一次 startDaemon 被误判成
 * "服务已在运行"。全部用端口 0，测完关掉服务、删临时目录。
 *
 * 失败注入点说明：本来想用"种一条 usage_json 损坏的过期运行"让过期清理把 engine.start()
 * 带崩，但引擎那一路刚加的出错隔离（评审 F6b）把 runRecovery / runRetentionSweep 都各自
 * 包了 try/catch，任何单个查询失败只会记日志，不会再让 start() 拒绝——这正是模块设计
 * 3.16 节要求的效果，不是缺陷，但意味着"数据库塞坏数据"这条路已经堵死。改用一个不依赖
 * src/engine/ 内部实现的失败点：提前在 daemon.json 应该落地的路径放一个同名目录，写入用
 * "先写临时文件再改名"，重命名的目标已经是目录时会失败，从而在引擎已经建好、HTTP 已经
 * 真正监听之后触发装配失败。
 *
 * 判定注入点足够真实、测试真的在验证清理逻辑（而不是碰巧总能通过）：
 * 写临时文件本身会成功（内容就是真实的 daemon.json，含真实端口号），只有随后的改名失败；
 * 失败后这个临时文件会留在目录里没人清，从它读出第一次尝试真正绑定的端口号，直接探测
 * 那个端口还有没有在响应——不这样做的话，第二次 startDaemon 永远用端口 0 重新要一个
 * 空闲端口，就算第一次泄漏的 HTTP 服务没关也不会露出来，测试会在没修的代码上一样通过。
 */
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { API_PATHS } from "@fleet/core";
import { describe, expect, it } from "vitest";
import { startDaemon } from "../../src/app/startDaemon.js";
import { createTempDir, removeTempDir } from "./support/tempDir.js";

// test/app -> test -> daemon -> packages -> 仓库根目录。
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function healthUrl(port: number): string {
  return `http://127.0.0.1:${port}${API_PATHS.health}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 项目开了 noPropertyAccessFromIndexSignature，Record<string, unknown> 不能用点号读字段。 */
function readUnknownField(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

/** 读失败时留下的 daemon.json.tmp-* 临时文件，取出里面记的真实端口号。 */
async function readLeakedPort(dir: string): Promise<number> {
  const entries = await readdir(dir);
  const tempNames = entries.filter((name) => name.startsWith("daemon.json.tmp-"));
  const tempName = tempNames[0];
  if (tempNames.length !== 1 || tempName === undefined) {
    throw new Error(`预期恰好一个 daemon.json.tmp-* 临时文件，实际找到 ${tempNames.length} 个`);
  }
  const parsed: unknown = JSON.parse(await readFile(join(dir, tempName), "utf8"));
  const port = isRecord(parsed) ? readUnknownField(parsed, "port") : undefined;
  if (typeof port !== "number") {
    throw new Error("临时文件里读不到端口号");
  }
  return port;
}

describe("startDaemon", () => {
  it("正常启动后 /api/health 能通；stop() 后端口不再响应，daemon.json 被删", async () => {
    const dir = await createTempDir("fleet-startdaemon-normal-");
    const handle = await startDaemon({
      home: dir,
      port: 0,
      repoRoot: REPO_ROOT,
      version: "0.0.0-test",
    });
    try {
      const health = await fetch(healthUrl(handle.port));
      expect(health.ok).toBe(true);

      const daemonInfoText = await readFile(join(dir, "daemon.json"), "utf8");
      expect(JSON.parse(daemonInfoText).port).toBe(handle.port);

      await handle.stop();

      await expect(readFile(join(dir, "daemon.json"), "utf8")).rejects.toThrow();
      await expect(
        fetch(healthUrl(handle.port), { signal: AbortSignal.timeout(500) }),
      ).rejects.toThrow();
    } finally {
      await handle.stop(); // 幂等：上面已经 stop 过也不会重复关闭或报错
      await removeTempDir(dir);
    }
  });

  it("同一数据目录已有一个活着的服务时，第二次启动报 conflict", async () => {
    const dir = await createTempDir("fleet-startdaemon-conflict-");
    const handle = await startDaemon({
      home: dir,
      port: 0,
      repoRoot: REPO_ROOT,
      version: "0.0.0-test",
    });
    try {
      await expect(
        startDaemon({ home: dir, port: 0, repoRoot: REPO_ROOT, version: "0.0.0-test" }),
      ).rejects.toMatchObject({ code: "conflict" });
    } finally {
      await handle.stop();
      await removeTempDir(dir);
    }
  });

  it("装配到一半失败时关掉已经监听的端口，同一数据目录之后能正常启动", async () => {
    const dir = await createTempDir("fleet-startdaemon-recover-");
    const daemonInfoPath = join(dir, "daemon.json");
    try {
      // daemon.json 该落地的地方先占一个目录：引擎会建好、HTTP 会真正监听，
      // 写 daemon.json 时"改名"这一步才会失败，正好卡在本次要修的清理路径中间。
      await mkdir(daemonInfoPath);

      await expect(
        startDaemon({ home: dir, port: 0, repoRoot: REPO_ROOT, version: "0.0.0-test" }),
      ).rejects.toThrow();

      // 缺陷本身：修复前这个端口还在响应 /api/health，httpHandle 从没被关掉。
      const leakedPort = await readLeakedPort(dir);
      await expect(
        fetch(healthUrl(leakedPort), { signal: AbortSignal.timeout(500) }),
      ).rejects.toThrow();

      await rm(daemonInfoPath, { recursive: true, force: true });

      const handle = await startDaemon({
        home: dir,
        port: 0,
        repoRoot: REPO_ROOT,
        version: "0.0.0-test",
      });
      try {
        const health = await fetch(healthUrl(handle.port));
        expect(health.ok).toBe(true);
      } finally {
        await handle.stop();
      }
    } finally {
      await removeTempDir(dir);
    }
  });
});
