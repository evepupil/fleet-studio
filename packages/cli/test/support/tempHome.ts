import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface DaemonJsonFields {
  readonly pid: number;
  readonly port: number;
  readonly token: string;
  readonly startedAt: string;
  readonly version: string;
  readonly home: string;
}

export interface TempHome {
  readonly path: string;
  writeDaemonJson(info: DaemonJsonFields): Promise<void>;
  cleanup(): Promise<void>;
}

/** 每个测试自己的临时数据目录，放在系统临时目录下，用完即删，不留垃圾。 */
export async function createTempHome(): Promise<TempHome> {
  const path = await mkdtemp(join(tmpdir(), "fleet-cli-test-"));
  return {
    path,
    async writeDaemonJson(info: DaemonJsonFields): Promise<void> {
      await writeFile(join(path, "daemon.json"), JSON.stringify(info), "utf8");
    },
    async cleanup(): Promise<void> {
      // 缺陷 10 修好之后，拉起的假服务子进程的 cwd 就是这个目录：进程刚被杀掉时，Windows
      // 释放目录句柄可能还差那么几十毫秒，直接删会碰到 EBUSY。带重试删，给它一点缓冲时间。
      await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}
