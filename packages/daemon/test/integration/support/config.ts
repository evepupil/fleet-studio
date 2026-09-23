/**
 * 集成测试的最小可用配置：一个测试池（容量可调）+ 一个只写编号和中文名的角色
 * （不写提示词路径——假苦工不读提示词，写了真实路径会让测试依赖本机环境，见任务书）+
 * runtimes.pi/opencode.command 指向假苦工脚本。写成 config.json，服务从这份文件启动。
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FleetConfigInput } from "@fleet/core";
import { fakeOpencodeCommand, fakePiCommand } from "@fleet/testkit";

export const TEST_POOL_ID = "test-pool";
export const TEST_ROLE_ID = "worker";

export interface TestConfigOptions {
  /** 池容量；调整容量的测试会在起服务后再 PATCH 它 */
  capacity: number;
  /** 单项目在池里的上限；不传则不限 */
  perProjectCap?: number | null;
}

export function buildTestConfig(options: TestConfigOptions): FleetConfigInput {
  return {
    version: 1,
    defaults: { pool: TEST_POOL_ID, role: TEST_ROLE_ID },
    pools: [
      {
        id: TEST_POOL_ID,
        label: "测试池",
        capacity: options.capacity,
        perProjectCap: options.perProjectCap ?? null,
        runtimes: {
          pi: { provider: "mcgrox", model: "deepseek-v4.1-flash" },
          opencode: { model: "mcgrox/deepseek-v4.1-flash" },
        },
      },
    ],
    roles: [{ id: TEST_ROLE_ID, label: "苦工" }],
    runtimes: {
      pi: { command: fakePiCommand() },
      opencode: { command: fakeOpencodeCommand() },
    },
  };
}

export async function writeTestConfig(home: string, config: FleetConfigInput): Promise<void> {
  await writeFile(join(home, "config.json"), JSON.stringify(config, null, 2), "utf8");
}
