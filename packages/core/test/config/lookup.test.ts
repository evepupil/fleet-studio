import { describe, expect, it } from "vitest";
import {
  applyPoolPatch,
  expandPath,
  expandRolePaths,
  findPool,
  findRole,
  opencodePromptPath,
  type PathEnv,
  poolChannelModel,
  poolRuntimes,
  resolveQueueTimeoutMs,
  resolveRunTimeoutMs,
} from "../../src/config/lookup.js";
import { parseConfig } from "../../src/config/parse.js";
import type {
  FleetConfig,
  OpencodeRoleConfig,
  PiRoleConfig,
  PoolConfig,
  RoleConfig,
} from "../../src/config/schema.js";
import { isFleetError } from "../../src/domain/errors.js";

/** 测试用：构造一份能通过校验的配置，构造失败直接抛错，让测试立刻暴露问题。 */
function parseOrThrow(input: unknown): FleetConfig {
  const result = parseConfig(input);
  if (!result.ok) {
    throw new Error(`测试用配置构造失败：${result.issues.join("; ")}`);
  }
  return result.config;
}

/** 测试用：直接拼一个满足 RoleConfig 输出形状的角色，不必每次都过 zod。 */
function roleFixture(pi: PiRoleConfig, opencode: OpencodeRoleConfig): RoleConfig {
  return { id: "r", label: "R", description: "", pi, opencode };
}

describe("findPool / findRole", () => {
  const config = parseOrThrow({
    version: 1,
    defaults: { pool: "a" },
    pools: [
      { id: "a", label: "池 A", capacity: 10, runtimes: { pi: { provider: "p", model: "m" } } },
    ],
    roles: [{ id: "worker", label: "工人" }],
  });

  it("找到存在的池 / 角色", () => {
    expect(findPool(config, "a")?.label).toBe("池 A");
    expect(findRole(config, "worker")?.label).toBe("工人");
  });

  it("找不到时返回 null", () => {
    expect(findPool(config, "missing")).toBeNull();
    expect(findRole(config, "missing")).toBeNull();
  });
});

describe("poolRuntimes", () => {
  function poolFixture(runtimes: PoolConfig["runtimes"]): PoolConfig {
    return {
      id: "a",
      label: "池 A",
      capacity: 1,
      perProjectCap: null,
      runTimeoutMin: null,
      queueTimeoutMin: null,
      enabled: true,
      runtimes,
    };
  }

  it("两种运行时都配了时 pi 在前", () => {
    const pool = poolFixture({
      pi: { provider: "p", model: "m" },
      opencode: { model: "c/m" },
    });
    expect(poolRuntimes(pool)).toEqual(["pi", "opencode"]);
  });

  it("只配了 opencode 时只返回 opencode", () => {
    expect(poolRuntimes(poolFixture({ opencode: { model: "m" } }))).toEqual(["opencode"]);
  });
});

describe("poolChannelModel", () => {
  const config = parseOrThrow({
    version: 1,
    defaults: {},
    pools: [
      {
        id: "both",
        label: "两种都有",
        capacity: 1,
        runtimes: {
          pi: { provider: "mcgrox", model: "deepseek-v4.1-flash" },
          opencode: { model: "mcgrox/deepseek-v4.1-flash" },
        },
      },
      {
        id: "pi-only",
        label: "只有 pi",
        capacity: 1,
        runtimes: { pi: { provider: "mcgrox", model: "m" } },
      },
      {
        id: "opencode-slash",
        label: "opencode 带斜杠",
        capacity: 1,
        runtimes: { opencode: { model: "mcgrox/deepseek-v4.1-flash" } },
      },
      {
        id: "opencode-plain",
        label: "opencode 不带斜杠",
        capacity: 1,
        runtimes: { opencode: { model: "deepseek-v4.1-flash" } },
      },
    ],
    roles: [{ id: "worker", label: "工人" }],
  });

  function poolOf(id: string): PoolConfig {
    const pool = findPool(config, id);
    if (!pool) {
      throw new Error(`测试夹具缺池：${id}`);
    }
    return pool;
  }

  it("pi：渠道取 provider，显示名是 provider/model", () => {
    expect(poolChannelModel(poolOf("both"), "pi")).toEqual({
      channel: "mcgrox",
      modelName: "deepseek-v4.1-flash",
      display: "mcgrox/deepseek-v4.1-flash",
    });
  });

  it("opencode 带斜杠：按第一个斜杠拆开渠道和模型", () => {
    expect(poolChannelModel(poolOf("both"), "opencode")).toEqual({
      channel: "mcgrox",
      modelName: "deepseek-v4.1-flash",
      display: "mcgrox/deepseek-v4.1-flash",
    });
  });

  it("opencode 不带斜杠：渠道取池编号", () => {
    expect(poolChannelModel(poolOf("opencode-plain"), "opencode")).toEqual({
      channel: "opencode-plain",
      modelName: "deepseek-v4.1-flash",
      display: "deepseek-v4.1-flash",
    });
  });

  it("省略 runtime 时 pi 优先", () => {
    expect(poolChannelModel(poolOf("both"))?.channel).toBe("mcgrox");
    expect(poolChannelModel(poolOf("both"))?.display).toBe("mcgrox/deepseek-v4.1-flash");
  });

  it("省略 runtime 且只有 opencode 时用 opencode", () => {
    expect(poolChannelModel(poolOf("opencode-slash"))).toEqual({
      channel: "mcgrox",
      modelName: "deepseek-v4.1-flash",
      display: "mcgrox/deepseek-v4.1-flash",
    });
  });

  it("指定了池没配的运行时返回 null", () => {
    expect(poolChannelModel(poolOf("pi-only"), "opencode")).toBeNull();
    expect(poolChannelModel(poolOf("opencode-slash"), "pi")).toBeNull();
  });
});

describe("resolveRunTimeoutMs", () => {
  const config = parseOrThrow({
    version: 1,
    defaults: { pool: "a", runTimeoutMin: 30 },
    pools: [
      {
        id: "a",
        label: "池 A",
        capacity: 10,
        runTimeoutMin: 20,
        runtimes: { pi: { provider: "p", model: "m" } },
      },
      { id: "b", label: "池 B", capacity: 10, runtimes: { pi: { provider: "p", model: "m" } } },
    ],
    roles: [{ id: "worker", label: "工人" }],
  });
  const poolWithOverride = findPool(config, "a");
  const poolWithoutOverride = findPool(config, "b");
  if (!poolWithOverride || !poolWithoutOverride) {
    throw new Error("测试夹具缺池");
  }

  it("单次覆盖优先于池和全局", () => {
    expect(resolveRunTimeoutMs(config, poolWithOverride, 5)).toBe(5 * 60_000);
  });

  it("没有单次覆盖时用池自己的值", () => {
    expect(resolveRunTimeoutMs(config, poolWithOverride)).toBe(20 * 60_000);
  });

  it("池和单次覆盖都没有时用全局默认", () => {
    expect(resolveRunTimeoutMs(config, poolWithoutOverride)).toBe(30 * 60_000);
  });
});

describe("resolveQueueTimeoutMs", () => {
  const config = parseOrThrow({
    version: 1,
    defaults: { pool: "a", queueTimeoutMin: 15 },
    pools: [
      {
        id: "a",
        label: "池 A",
        capacity: 10,
        queueTimeoutMin: 8,
        runtimes: { pi: { provider: "p", model: "m" } },
      },
      { id: "b", label: "池 B", capacity: 10, runtimes: { pi: { provider: "p", model: "m" } } },
    ],
    roles: [{ id: "worker", label: "工人" }],
  });
  const poolWithOverride = findPool(config, "a");
  const poolWithoutOverride = findPool(config, "b");
  if (!poolWithOverride || !poolWithoutOverride) {
    throw new Error("测试夹具缺池");
  }

  it("单次覆盖为具体数字时优先于池和全局", () => {
    expect(resolveQueueTimeoutMs(config, poolWithOverride, 3)).toBe(3 * 60_000);
  });

  it("单次覆盖显式传 null 表示不限时，不再看池和全局", () => {
    expect(resolveQueueTimeoutMs(config, poolWithOverride, null)).toBeNull();
  });

  it("没有单次覆盖时用池自己的值", () => {
    expect(resolveQueueTimeoutMs(config, poolWithOverride)).toBe(8 * 60_000);
  });

  it("池和单次覆盖都没有时用全局默认", () => {
    expect(resolveQueueTimeoutMs(config, poolWithoutOverride)).toBe(15 * 60_000);
  });

  it("全局默认也是 null 时返回 null", () => {
    const configAllNull = parseOrThrow({
      version: 1,
      defaults: { pool: "a", queueTimeoutMin: null },
      pools: [
        { id: "a", label: "池 A", capacity: 10, runtimes: { pi: { provider: "p", model: "m" } } },
      ],
      roles: [{ id: "worker", label: "工人" }],
    });
    const pool = findPool(configAllNull, "a");
    if (!pool) {
      throw new Error("测试夹具缺池");
    }
    expect(resolveQueueTimeoutMs(configAllNull, pool)).toBeNull();
  });
});

describe("expandPath", () => {
  const winEnv: PathEnv = { home: "C:\\Users\\zhoutao", builtinRoot: "C:\\code\\fleet-studio" };
  const posixEnv: PathEnv = { home: "/home/ubuntu", builtinRoot: "/home/ubuntu/code/fleet-studio" };

  it("展开 ~ 开头的路径（规格里的例子）", () => {
    expect(expandPath("~/.pi/agent/roles/worker.md", winEnv)).toBe(
      "C:\\Users\\zhoutao\\.pi\\agent\\roles\\worker.md",
    );
  });

  it("裸 ~ 展开成 home 本身", () => {
    expect(expandPath("~", winEnv)).toBe("C:\\Users\\zhoutao");
  });

  it("展开 builtin: 开头的路径", () => {
    expect(expandPath("builtin:roles/tester.md", winEnv)).toBe(
      "C:\\code\\fleet-studio\\roles\\tester.md",
    );
  });

  it("混合斜杠统一换成 home 的分隔符风格", () => {
    expect(expandPath("~/foo\\bar/baz", winEnv)).toBe("C:\\Users\\zhoutao\\foo\\bar\\baz");
  });

  it("posix 环境下用 / 拼接", () => {
    expect(expandPath("~/.pi/agent/roles/worker.md", posixEnv)).toBe(
      "/home/ubuntu/.pi/agent/roles/worker.md",
    );
    expect(expandPath("builtin:roles/tester.md", posixEnv)).toBe(
      "/home/ubuntu/code/fleet-studio/roles/tester.md",
    );
  });

  it("不认识的前缀原样返回", () => {
    expect(expandPath("C:\\code\\x", winEnv)).toBe("C:\\code\\x");
    expect(expandPath("relative/path.md", winEnv)).toBe("relative/path.md");
    expect(expandPath("~foobar", winEnv)).toBe("~foobar");
  });
});

describe("expandRolePaths", () => {
  const env: PathEnv = { home: "C:\\Users\\zhoutao", builtinRoot: "C:\\code\\fleet-studio" };

  it("展开 pi.appendSystemPrompt 和 opencode.promptFile，其余字段不变，不修改入参", () => {
    const role = roleFixture(
      { appendSystemPrompt: "~/.pi/agent/roles/worker.md", excludeTools: ["a"] },
      { promptFile: "builtin:roles/worker.md" },
    );
    const expanded = expandRolePaths(role, env);
    expect(expanded.pi.appendSystemPrompt).toBe("C:\\Users\\zhoutao\\.pi\\agent\\roles\\worker.md");
    expect(expanded.opencode.promptFile).toBe("C:\\code\\fleet-studio\\roles\\worker.md");
    expect(expanded.pi.excludeTools).toEqual(["a"]);
    expect(expanded.id).toBe("r");
    // 不修改入参
    expect(role.pi.appendSystemPrompt).toBe("~/.pi/agent/roles/worker.md");
    expect(role.opencode.promptFile).toBe("builtin:roles/worker.md");
  });

  it("没有提示词路径时保持原样", () => {
    const role = roleFixture({}, {});
    const expanded = expandRolePaths(role, env);
    expect(expanded.pi).toEqual({});
    expect(expanded.opencode).toEqual({});
  });

  it("opencode 有 agent 没有 promptFile 时不受影响", () => {
    const role = roleFixture({}, { agent: "worker" });
    const expanded = expandRolePaths(role, env);
    expect(expanded.opencode).toEqual({ agent: "worker" });
  });
});

describe("opencodePromptPath", () => {
  it("有 opencode.agent 时返回 null", () => {
    const role = roleFixture({ appendSystemPrompt: "x.md" }, { agent: "worker" });
    expect(opencodePromptPath(role)).toBeNull();
  });

  it("没有 agent 时优先用 opencode.promptFile", () => {
    const role = roleFixture({ appendSystemPrompt: "x.md" }, { promptFile: "p.md" });
    expect(opencodePromptPath(role)).toBe("p.md");
  });

  it("既没有 agent 也没有 promptFile 时借用 pi 的提示词", () => {
    const role = roleFixture({ appendSystemPrompt: "x.md" }, {});
    expect(opencodePromptPath(role)).toBe("x.md");
  });

  it("什么都没有时返回 null", () => {
    const role = roleFixture({}, {});
    expect(opencodePromptPath(role)).toBeNull();
  });
});

describe("applyPoolPatch", () => {
  const config = parseOrThrow({
    version: 1,
    defaults: { pool: "a" },
    pools: [
      {
        id: "a",
        label: "池 A",
        capacity: 10,
        perProjectCap: 2,
        runtimes: { pi: { provider: "p", model: "m" } },
      },
      { id: "b", label: "池 B", capacity: 5, runtimes: { pi: { provider: "p", model: "m" } } },
    ],
    roles: [{ id: "worker", label: "工人" }],
  });

  it("只改 capacity，perProjectCap 不变", () => {
    const patched = applyPoolPatch(config, "a", { capacity: 99 });
    expect(findPool(patched, "a")).toMatchObject({ capacity: 99, perProjectCap: 2 });
  });

  it("只改 perProjectCap，capacity 不变", () => {
    const patched = applyPoolPatch(config, "a", { perProjectCap: null });
    expect(findPool(patched, "a")).toMatchObject({ capacity: 10, perProjectCap: null });
  });

  it("不修改入参配置", () => {
    applyPoolPatch(config, "a", { capacity: 1 });
    expect(findPool(config, "a")).toMatchObject({ capacity: 10, perProjectCap: 2 });
  });

  it("不改动其他池", () => {
    const patched = applyPoolPatch(config, "a", { capacity: 1 });
    expect(findPool(patched, "b")).toMatchObject({ capacity: 5 });
  });

  it("池不存在时抛 FleetError(not_found)", () => {
    expect.assertions(3);
    try {
      applyPoolPatch(config, "missing", { capacity: 1 });
    } catch (error) {
      expect(isFleetError(error)).toBe(true);
      if (isFleetError(error)) {
        expect(error.code).toBe("not_found");
        expect(error.message).toBe("池不存在：missing");
      }
    }
  });
});
