import { describe, expect, it } from "vitest";
import { buildLaunch, displayModel } from "../../../src/runtimes/pi/args.js";
import { ARGV_PROMPT_MAX_CHARS } from "../../../src/runtimes/types.js";
import {
  captureFleetError,
  makeBuildLaunchInput,
  makeOpencodeOnlyPool,
  makePiPool,
  makeRole,
} from "./factories.js";

describe("pi displayModel", () => {
  it("池配置了 pi 模型时返回 <provider>/<model>", () => {
    expect(displayModel(makePiPool())).toBe("mcgrox/deepseek-v4.1-flash");
  });

  it("池没有为 pi 指定模型时返回 null", () => {
    expect(displayModel(makeOpencodeOnlyPool())).toBeNull();
  });
});

describe("pi buildLaunch 参数顺序与基本形状", () => {
  it("最小输入：固定参数按顺序排列，消息放在最后，不需要写文件", () => {
    const spec = buildLaunch(makeBuildLaunchInput());

    expect(spec.args).toEqual([
      "--mode",
      "json",
      "--provider",
      "mcgrox",
      "--model",
      "deepseek-v4.1-flash",
      "--session-id",
      "fleet-w00001",
      "--name",
      "示例任务",
      "--no-approve",
      "-p",
      "把这件事做完",
    ]);
    expect(spec.files).toEqual([]);
  });

  it("thinking 非 null 时插入 --thinking，位置在 --no-approve 之后", () => {
    const spec = buildLaunch(makeBuildLaunchInput({ thinking: "low" }));
    const noApproveIndex = spec.args.indexOf("--no-approve");
    expect(spec.args.slice(noApproveIndex + 1, noApproveIndex + 3)).toEqual(["--thinking", "low"]);
  });

  it("thinking 为 null 时不出现 --thinking", () => {
    const spec = buildLaunch(makeBuildLaunchInput({ thinking: null }));
    expect(spec.args).not.toContain("--thinking");
  });

  it("role.pi.appendSystemPrompt 存在时插入 --append-system-prompt", () => {
    const spec = buildLaunch(
      makeBuildLaunchInput({ role: makeRole({ appendSystemPrompt: "C:\\prompts\\reviewer.md" }) }),
    );
    expect(spec.args).toContain("--append-system-prompt");
    expect(spec.args[spec.args.indexOf("--append-system-prompt") + 1]).toBe(
      "C:\\prompts\\reviewer.md",
    );
  });

  it("role.pi.tools 非空时插入逗号连接的 --tools", () => {
    const spec = buildLaunch(makeBuildLaunchInput({ role: makeRole({ tools: ["read", "bash"] }) }));
    expect(spec.args[spec.args.indexOf("--tools") + 1]).toBe("read,bash");
  });

  it("role.pi.tools 是空数组时不插入 --tools", () => {
    const spec = buildLaunch(makeBuildLaunchInput({ role: makeRole({ tools: [] }) }));
    expect(spec.args).not.toContain("--tools");
  });

  it("role.pi.excludeTools 非空时插入逗号连接的 --exclude-tools", () => {
    const spec = buildLaunch(makeBuildLaunchInput({ role: makeRole({ excludeTools: ["write"] }) }));
    expect(spec.args[spec.args.indexOf("--exclude-tools") + 1]).toBe("write");
  });

  it("role.pi.excludeTools 是空数组时不插入 --exclude-tools", () => {
    const spec = buildLaunch(makeBuildLaunchInput({ role: makeRole({ excludeTools: [] }) }));
    expect(spec.args).not.toContain("--exclude-tools");
  });

  it("四个可选项同时出现时，顺序是 thinking → append-system-prompt → tools → exclude-tools", () => {
    const spec = buildLaunch(
      makeBuildLaunchInput({
        thinking: "high",
        role: makeRole({
          appendSystemPrompt: "系统附加提示",
          tools: ["read"],
          excludeTools: ["write"],
        }),
      }),
    );
    const flagsInOrder = spec.args.filter((arg) =>
      ["--thinking", "--append-system-prompt", "--tools", "--exclude-tools"].includes(arg),
    );
    expect(flagsInOrder).toEqual([
      "--thinking",
      "--append-system-prompt",
      "--tools",
      "--exclude-tools",
    ]);
    // -p 消息始终是最后两个元素之一（消息本身是最后一个）。
    expect(spec.args.at(-2)).toBe("-p");
  });

  it("续接（isContinuation=true）与首次运行（false）在其余输入相同时参数形状完全一样", () => {
    const first = buildLaunch(makeBuildLaunchInput({ isContinuation: false, prompt: "追加指令" }));
    const resumed = buildLaunch(makeBuildLaunchInput({ isContinuation: true, prompt: "追加指令" }));
    expect(resumed.args).toEqual(first.args);
  });

  it("池没有为 pi 指定模型时抛 FleetError(runtime_unavailable)，说明里带池编号", () => {
    const error = captureFleetError(() =>
      buildLaunch(makeBuildLaunchInput({ pool: makeOpencodeOnlyPool() })),
    );
    expect(error.code).toBe("runtime_unavailable");
    expect(error.message).toContain("oc");
  });

  it("sessionRef 为 null 时抛 FleetError(invalid_request)：pi 总要有会话编号", () => {
    const error = captureFleetError(() => buildLaunch(makeBuildLaunchInput({ sessionRef: null })));
    expect(error.code).toBe("invalid_request");
  });
});

describe("pi buildLaunch 任务正文", () => {
  it("正文以 - 开头时用 guardLeadingDash 补一个换行，避免被当成选项", () => {
    const spec = buildLaunch(makeBuildLaunchInput({ prompt: "-rf 删掉这些文件" }));
    expect(spec.args.at(-1)).toBe("\n-rf 删掉这些文件");
  });

  it("正文以 @ 开头时同样补一个换行，避免被当成文件引用", () => {
    const spec = buildLaunch(makeBuildLaunchInput({ prompt: "@看起来像文件引用" }));
    expect(spec.args.at(-1)).toBe("\n@看起来像文件引用");
  });

  it("正文超过 ARGV_PROMPT_MAX_CHARS 时写文件，argv 换成固定指令 + @路径", () => {
    const longPrompt = "长任务".repeat(Math.ceil((ARGV_PROMPT_MAX_CHARS + 100) / 3));
    const input = makeBuildLaunchInput({ prompt: longPrompt, runDir: "C:\\fleet\\runs\\w00001.1" });
    const spec = buildLaunch(input);

    expect(spec.files).toEqual([
      { path: "C:\\fleet\\runs\\w00001.1\\task.md", content: longPrompt },
    ]);
    expect(spec.args.slice(-3)).toEqual([
      "-p",
      "请完整阅读并执行上面文件里的任务说明。",
      "@C:\\fleet\\runs\\w00001.1\\task.md",
    ]);
  });

  it("正文长度恰好等于上限时仍走 argv 直传（不超过才算超过）", () => {
    const exactPrompt = "a".repeat(ARGV_PROMPT_MAX_CHARS);
    const spec = buildLaunch(makeBuildLaunchInput({ prompt: exactPrompt }));
    expect(spec.files).toEqual([]);
    expect(spec.args.at(-1)).toBe(exactPrompt);
  });
});
