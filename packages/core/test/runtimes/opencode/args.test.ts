import { describe, expect, it } from "vitest";
import type { OpencodePoolModel, PoolConfig, RoleConfig } from "../../../src/config/schema.js";
import { poolConfigSchema, roleConfigSchema } from "../../../src/config/schema.js";
import { FleetError } from "../../../src/domain/errors.js";
import { opencodeAdapter } from "../../../src/runtimes/opencode/index.js";
import type { BuildLaunchInput } from "../../../src/runtimes/types.js";
import { ARGV_PROMPT_MAX_CHARS } from "../../../src/runtimes/types.js";

/** 只给 opencode 指定模型的最小池；不传 opencode 时退回一个只有 pi 模型的池，用来测"没有 opencode 模型"分支。 */
function makePool(
  opencode: OpencodePoolModel | undefined = { model: "mcgrox/deepseek-v4.1-flash" },
): PoolConfig {
  return poolConfigSchema.parse({
    id: "dsf",
    label: "池",
    capacity: 10,
    runtimes: opencode === undefined ? { pi: { provider: "p", model: "m" } } : { opencode },
  });
}

function makeRole(opencode: { agent?: string } = {}): RoleConfig {
  return roleConfigSchema.parse({ id: "worker", label: "实现", opencode });
}

function baseInput(overrides: Partial<BuildLaunchInput> = {}): BuildLaunchInput {
  return {
    prompt: "把这件事做完",
    runDir: "C:\\temp\\run1",
    cwd: "C:\\code\\demo",
    title: "示例任务",
    sessionRef: null,
    isContinuation: false,
    thinking: null,
    pool: makePool(),
    role: makeRole(),
    rolePromptText: null,
    ...overrides,
  };
}

/** 断言 fn 抛出 FleetError 并返回它，方便继续检查 code/message。 */
function captureFleetError(fn: () => unknown): FleetError {
  try {
    fn();
  } catch (error) {
    if (error instanceof FleetError) {
      return error;
    }
    throw error;
  }
  throw new Error("期望抛出 FleetError，但没有抛出");
}

describe("opencodeAdapter.buildLaunch", () => {
  it("首次运行、没有任何可选项：按固定顺序拼参数，短任务直接作为最后一个参数", () => {
    const spec = opencodeAdapter.buildLaunch(baseInput());
    expect(spec.args).toEqual([
      "run",
      "--format",
      "json",
      "--auto",
      "--dir",
      "C:\\code\\demo",
      "-m",
      "mcgrox/deepseek-v4.1-flash",
      "--title",
      "示例任务",
      "--thinking",
      "把这件事做完",
    ]);
    expect(spec.files).toEqual([]);
  });

  it("池配置带 variant 时，-m 后面紧跟 --variant", () => {
    const pool = makePool({ model: "gpt-5-mini", variant: "high" });
    const spec = opencodeAdapter.buildLaunch(baseInput({ pool }));
    expect(spec.args.slice(0, 10)).toEqual([
      "run",
      "--format",
      "json",
      "--auto",
      "--dir",
      "C:\\code\\demo",
      "-m",
      "gpt-5-mini",
      "--variant",
      "high",
    ]);
  });

  it("有 --agent 时不拼角色提示词，即使 rolePromptText 非 null", () => {
    const role = makeRole({ agent: "worker" });
    const spec = opencodeAdapter.buildLaunch(
      baseInput({ role, rolePromptText: "你是一个只读侦察角色" }),
    );
    const agentIndex = spec.args.indexOf("--agent");
    expect(agentIndex).toBeGreaterThan(-1);
    expect(spec.args[agentIndex + 1]).toBe("worker");
    expect(spec.args.at(-1)).toBe("把这件事做完");
  });

  it("没有 --agent 且 rolePromptText 非 null 时，消息拼成 角色提示词 + 分隔线 + 正文", () => {
    const spec = opencodeAdapter.buildLaunch(baseInput({ rolePromptText: "你是一个只读侦察角色" }));
    expect(spec.args).not.toContain("--agent");
    expect(spec.args.at(-1)).toBe("你是一个只读侦察角色\n\n---\n\n把这件事做完");
  });

  it("续接时用 --session 代替 --title，且不传 --title", () => {
    const spec = opencodeAdapter.buildLaunch(
      baseInput({ isContinuation: true, sessionRef: "ses_abc", title: "不应该出现" }),
    );
    expect(spec.args).not.toContain("--title");
    const sessionIndex = spec.args.indexOf("--session");
    expect(sessionIndex).toBeGreaterThan(-1);
    expect(spec.args[sessionIndex + 1]).toBe("ses_abc");
  });

  it("续接却没有 sessionRef 时抛 invalid_request", () => {
    const error = captureFleetError(() =>
      opencodeAdapter.buildLaunch(baseInput({ isContinuation: true, sessionRef: null })),
    );
    expect(error.code).toBe("invalid_request");
    expect(error.message).toBe("会话还没建立，无法续接");
  });

  it("池没有 opencode 模型时抛 runtime_unavailable", () => {
    const pool = poolConfigSchema.parse({
      id: "onlypi",
      label: "只有 pi",
      capacity: 5,
      runtimes: { pi: { provider: "p", model: "m" } },
    });
    const error = captureFleetError(() => opencodeAdapter.buildLaunch(baseInput({ pool })));
    expect(error.code).toBe("runtime_unavailable");
    expect(error.message).toBe("池 onlypi 没有为 opencode 指定模型");
  });

  it("正文超过 ARGV_PROMPT_MAX_CHARS 时写文件，-f 紧跟路径之后是 --thinking 而不是消息（D4）", () => {
    // -f 在 opencode 里是 [array] 类型参数：会一直吞后面的位置参数直到遇到下一个开关，
    // 所以 -f <路径> 后面必须紧跟 --thinking 把数组截断，否则排在最后的任务正文消息
    // 也会被当成 -f 的附件一起吞掉（旧顺序 --thinking -f <路径> <消息> 就是这么坏的）。
    const longPrompt = "a".repeat(ARGV_PROMPT_MAX_CHARS + 1);
    const spec = opencodeAdapter.buildLaunch(
      baseInput({ prompt: longPrompt, runDir: "C:\\temp\\run1" }),
    );
    expect(spec.files).toEqual([{ path: "C:\\temp\\run1\\task.md", content: longPrompt }]);
    expect(spec.args).toEqual([
      "run",
      "--format",
      "json",
      "--auto",
      "--dir",
      "C:\\code\\demo",
      "-m",
      "mcgrox/deepseek-v4.1-flash",
      "--title",
      "示例任务",
      "-f",
      "C:\\temp\\run1\\task.md",
      "--thinking",
      "请完整阅读并执行附件文件里的任务说明。",
    ]);
    const fileFlagIndex = spec.args.indexOf("-f");
    expect(spec.args[fileFlagIndex + 1]).toBe("C:\\temp\\run1\\task.md");
    expect(spec.args[fileFlagIndex + 2]).toBe("--thinking");
    expect(spec.args.at(-1)).toBe("请完整阅读并执行附件文件里的任务说明。");
  });

  it("正文正好等于 ARGV_PROMPT_MAX_CHARS 时不算超长，仍走命令行参数", () => {
    const exact = "a".repeat(ARGV_PROMPT_MAX_CHARS);
    const spec = opencodeAdapter.buildLaunch(baseInput({ prompt: exact }));
    expect(spec.files).toEqual([]);
    expect(spec.args.at(-1)).toBe(exact);
    expect(spec.args).not.toContain("-f");
  });

  it("正文以 - 开头时，消息前面补一个换行，避免被当成选项", () => {
    const spec = opencodeAdapter.buildLaunch(baseInput({ prompt: "-x 危险参数" }));
    expect(spec.args.at(-1)).toBe("\n-x 危险参数");
  });

  it("正文以 @ 开头时，消息前面补一个换行，避免被当成文件引用", () => {
    const spec = opencodeAdapter.buildLaunch(baseInput({ prompt: "@file.txt" }));
    expect(spec.args.at(-1)).toBe("\n@file.txt");
  });

  it("variant、agent、续接同时出现时，顺序仍是 --dir -m --variant --agent --session --thinking", () => {
    const pool = makePool({ model: "gpt-5-mini", variant: "max" });
    const role = makeRole({ agent: "scout" });
    const spec = opencodeAdapter.buildLaunch(
      baseInput({ pool, role, isContinuation: true, sessionRef: "ses_1" }),
    );
    expect(spec.args).toEqual([
      "run",
      "--format",
      "json",
      "--auto",
      "--dir",
      "C:\\code\\demo",
      "-m",
      "gpt-5-mini",
      "--variant",
      "max",
      "--agent",
      "scout",
      "--session",
      "ses_1",
      "--thinking",
      "把这件事做完",
    ]);
  });
});

describe("opencodeAdapter.displayModel", () => {
  it("池有 opencode 模型时返回它的 model", () => {
    expect(opencodeAdapter.displayModel(makePool({ model: "gpt-5-mini" }))).toBe("gpt-5-mini");
  });

  it("池没有 opencode 模型时返回 null", () => {
    const pool = poolConfigSchema.parse({
      id: "p2",
      label: "L",
      capacity: 1,
      runtimes: { pi: { provider: "p", model: "m" } },
    });
    expect(opencodeAdapter.displayModel(pool)).toBeNull();
  });
});
