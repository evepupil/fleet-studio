import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUILTIN_PREFIX, DEFAULT_CONFIG } from "../../src/config/defaults.js";

/** 仓库根目录：builtin: 开头的提示词路径相对它展开。 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

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

  it("五个角色编号齐全，顺序和规格表一致", () => {
    expect(DEFAULT_CONFIG.roles.map((role) => role.id)).toEqual([
      "worker",
      "scout",
      "reviewer",
      "fixer",
      "tester",
    ]);
  });

  it("每个角色的提示词都走 builtin:roles/<角色>.md，只在仓库里维护一份", () => {
    for (const role of DEFAULT_CONFIG.roles) {
      expect(role.pi?.appendSystemPrompt, role.id).toBe(`${BUILTIN_PREFIX}roles/${role.id}.md`);
    }
  });

  it("每个角色的提示词文件都真的在仓库 roles/ 里", () => {
    const missing = DEFAULT_CONFIG.roles
      .map((role) => `roles/${role.id}.md`)
      .filter((relativePath) => !existsSync(join(REPO_ROOT, relativePath)));
    expect(missing).toEqual([]);
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
