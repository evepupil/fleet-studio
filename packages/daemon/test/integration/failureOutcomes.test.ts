/**
 * 规格第 5 节第 4 条：三种失败剧本——model-error（失败，原因 model_error）、
 * no-key（失败，说明里带缺密钥的提示文字）、crash（失败，原因 exit_code）。
 * pi 和 opencode 各测一遍。
 */
import { scenarioPrompt } from "@fleet/testkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Harness, startHarness } from "./support/harness.js";
import { submitAndWait } from "./support/runOnce.js";

describe("三种失败剧本：model-error / no-key / crash（规格第 4 条）", () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await startHarness({ capacity: 3 });
  }, 20000);

  // 全仓并行跑测试时 harness.stop() 要多花时间做假苦工进程的收尾，比 vitest 默认的
  // 10 秒钩子超时更容易超支，显式调宽。
  afterEach(async () => {
    await harness.stop();
  }, 30000);

  async function run(runtime: "pi" | "opencode", scenario: string) {
    const { summary } = await submitAndWait(
      harness,
      {
        projectPath: harness.projectDir,
        prompt: scenarioPrompt(scenario, { delayMs: 50, exitCode: 3 }),
        runtime,
      },
      15,
    );
    return summary;
  }

  // 每条剧本本身跑得很快，但 /api/wait 单次最多挂 15 秒；显式调宽测试自身的超时
  // （项目全局 testTimeout 是 20 秒），避免开发机繁忙时卡在默认预算上。
  const TEST_TIMEOUT_MS = 25000;

  it(
    "pi 的 model-error 剧本：失败，原因 model_error，说明是错误原文",
    async () => {
      const summary = await run("pi", "model-error");
      expect(summary.status).toBe("failed");
      expect(summary.failReason).toBe("model_error");
      expect(summary.errorMessage).toBe("404: model not found");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "opencode 的 model-error 剧本：失败，原因 model_error，说明是错误原文",
    async () => {
      const summary = await run("opencode", "model-error");
      expect(summary.status).toBe("failed");
      expect(summary.failReason).toBe("model_error");
      expect(summary.errorMessage).toBe("model not found");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "pi 的 no-key 剧本：失败，说明里带缺密钥的提示文字",
    async () => {
      const summary = await run("pi", "no-key");
      expect(summary.status).toBe("failed");
      expect(summary.errorMessage).toContain("No API key found for mcgrox.");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "opencode 的 no-key 剧本：失败，说明里带缺密钥的提示文字",
    async () => {
      const summary = await run("opencode", "no-key");
      expect(summary.status).toBe("failed");
      expect(summary.errorMessage).toContain("no API key found for mcgrox.");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "pi 的 crash 剧本：失败，原因 exit_code，说明带退出码",
    async () => {
      const summary = await run("pi", "crash");
      expect(summary.status).toBe("failed");
      expect(summary.failReason).toBe("exit_code");
      expect(summary.errorMessage).toBe("进程退出码 3");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "opencode 的 crash 剧本：失败，原因 exit_code，说明带退出码",
    async () => {
      const summary = await run("opencode", "crash");
      expect(summary.status).toBe("failed");
      expect(summary.failReason).toBe("exit_code");
      expect(summary.errorMessage).toBe("进程退出码 3");
    },
    TEST_TIMEOUT_MS,
  );
});
