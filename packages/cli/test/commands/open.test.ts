import { afterEach, describe, expect, it } from "vitest";
import { runOpenCommand } from "../../src/commands/open.js";
import { EXIT_CODE } from "../../src/errors.js";
import { type CommandHarness, createCommandHarness } from "../support/commandHarness.js";

let harness: CommandHarness | undefined;

afterEach(async () => {
  await harness?.cleanup();
  harness = undefined;
});

describe("runOpenCommand", () => {
  it("用 rundll32 打开看板地址，不经过 shell 拼命令", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: { ok: true } }));

    const calls: { command: string; args: readonly string[] }[] = [];
    const exitCode = await runOpenCommand([], harness.deps, (command, args) => {
      calls.push({ command, args });
    });

    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("rundll32");
    // 默认进总览页（规格第二版 4）。
    const url = `${harness.stub.baseUrl}/#/overview`;
    expect(calls[0]?.args).toEqual(["url.dll,FileProtocolHandler", url]);
    expect(harness.deps.stdoutLines).toContain(`已打开 ${url}`);
  });

  it("--help 时只打印用法，不连服务也不打开任何东西", async () => {
    harness = await createCommandHarness(() => ({ status: 200, body: { ok: true } }));
    let launched = false;
    const exitCode = await runOpenCommand(["--help"], harness.deps, () => {
      launched = true;
    });
    expect(exitCode).toBe(EXIT_CODE.ok);
    expect(launched).toBe(false);
    expect(harness.stub.requests.length).toBe(0);
  });
});

// 非 Windows 平台报用法错误这条分支没有单独覆盖：改写 process.platform 会影响同进程里
// 其他并发测试和测试基础设施本身的行为（曾经实测导致整个测试进程挂死），不值得为了这一个
// 防御性分支冒这个风险；本机项目本来就是 Windows-only（见全局规范），这条分支只是兜底。
