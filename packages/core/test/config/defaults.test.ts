import { describe, expect, it } from "vitest";
import { BUILTIN_PREFIX, DEFAULT_CONFIG } from "../../src/config/defaults.js";

describe("BUILTIN_PREFIX", () => {
  it("等于 builtin:", () => {
    expect(BUILTIN_PREFIX).toBe("builtin:");
  });
});

describe("DEFAULT_CONFIG", () => {
  it("顶层字段和规格一致", () => {
    expect(DEFAULT_CONFIG.version).toBe(1);
    expect(DEFAULT_CONFIG.port).toBe(4870);
    expect(DEFAULT_CONFIG.retentionDays).toBe(7);
    expect(DEFAULT_CONFIG.snapshotWindowHours).toBe(24);
    expect(DEFAULT_CONFIG.defaults).toEqual({
      pool: "dsf",
      runtime: "pi",
      role: "worker",
      runTimeoutMin: 30,
      queueTimeoutMin: null,
      thinking: null,
    });
  });

  it("只有一个默认池 dsf，两种运行时都配了模型", () => {
    expect(DEFAULT_CONFIG.pools).toHaveLength(1);
    expect(DEFAULT_CONFIG.pools[0]).toEqual({
      id: "dsf",
      label: "DeepSeek V4.1 Flash",
      capacity: 20,
      perProjectCap: null,
      runTimeoutMin: null,
      queueTimeoutMin: null,
      runtimes: {
        pi: { provider: "mcgrox", model: "deepseek-v4.1-flash" },
        opencode: { model: "mcgrox/deepseek-v4.1-flash" },
      },
    });
  });

  it("九个角色编号齐全，顺序和规格表一致", () => {
    expect(DEFAULT_CONFIG.roles.map((role) => role.id)).toEqual([
      "worker",
      "scout",
      "reviewer",
      "fixer",
      "tester",
      "ia-scout",
      "ia-expand",
      "ia-critic",
      "ia-writer",
    ]);
  });

  it("tester 角色的提示词走 builtin: 前缀", () => {
    const tester = DEFAULT_CONFIG.roles.find((role) => role.id === "tester");
    expect(tester?.pi?.appendSystemPrompt).toBe(`${BUILTIN_PREFIX}roles/tester.md`);
  });

  it("scout 角色只屏蔽写文件工具，opencode 走内置 agent", () => {
    const scout = DEFAULT_CONFIG.roles.find((role) => role.id === "scout");
    expect(scout?.pi?.excludeTools).toEqual(["write", "edit"]);
    expect(scout?.opencode).toEqual({ agent: "scout" });
  });

  it("fixer 角色不联网，opencode 没有指定 agent", () => {
    const fixer = DEFAULT_CONFIG.roles.find((role) => role.id === "fixer");
    expect(fixer?.pi?.excludeTools).toEqual(["web_search", "get_search_content", "source_check"]);
    expect(fixer?.opencode).toEqual({});
  });
});
