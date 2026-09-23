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
      await rm(path, { recursive: true, force: true });
    },
  };
}
