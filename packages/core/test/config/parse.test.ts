import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/config/defaults.js";
import { parseConfig, parseConfigText } from "../../src/config/parse.js";

describe("parseConfig", () => {
  it("DEFAULT_CONFIG 必须能通过校验", () => {
    const result = parseConfig(DEFAULT_CONFIG);
    expect(result.ok).toBe(true);
  });

  it("补齐省略的默认值", () => {
    const result = parseConfig({
      version: 1,
      defaults: { pool: "dsf" },
      pools: [
        {
          id: "dsf",
          label: "池",
          capacity: 10,
          runtimes: { pi: { provider: "p", model: "m" } },
        },
      ],
      roles: [{ id: "worker", label: "工人" }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.config.port).toBe(4870);
    expect(result.config.retentionDays).toBe(7);
    expect(result.config.snapshotWindowHours).toBe(24);
    expect(result.config.defaults.runtime).toBe("pi");
    expect(result.config.defaults.role).toBe("worker");
    expect(result.config.defaults.queueTimeoutMin).toBeNull();
    const pool = result.config.pools[0];
    expect(pool?.perProjectCap).toBeNull();
    expect(pool?.runTimeoutMin).toBeNull();
    const role = result.config.roles[0];
    expect(role?.description).toBe("");
    expect(role?.pi).toEqual({});
    expect(role?.opencode).toEqual({});
    expect(result.config.runtimes).toEqual({ pi: { command: null }, opencode: { command: null } });
  });

  it("根节点类型不对时报根路径 (根)", () => {
    const result = parseConfig("不是对象");
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues.some((issue) => issue.startsWith("(根):"))).toBe(true);
  });

  it("默认池不存在时报出带路径的问题", () => {
    const result = parseConfig({
      version: 1,
      defaults: { pool: "missing" },
      pools: [
        { id: "dsf", label: "池", capacity: 10, runtimes: { pi: { provider: "p", model: "m" } } },
      ],
      roles: [{ id: "worker", label: "工人" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues).toContain("defaults.pool: 默认池不存在：missing");
  });

  it("默认角色不存在时报出带路径的问题", () => {
    const result = parseConfig({
      version: 1,
      defaults: { pool: "dsf", role: "missing" },
      pools: [
        { id: "dsf", label: "池", capacity: 10, runtimes: { pi: { provider: "p", model: "m" } } },
      ],
      roles: [{ id: "worker", label: "工人" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues).toContain("defaults.role: 默认角色不存在：missing");
  });

  it("池编号重复时报出带路径的问题", () => {
    const result = parseConfig({
      version: 1,
      defaults: { pool: "dsf" },
      pools: [
        { id: "dsf", label: "池 1", capacity: 10, runtimes: { pi: { provider: "p", model: "m" } } },
        { id: "dsf", label: "池 2", capacity: 5, runtimes: { pi: { provider: "p", model: "m" } } },
      ],
      roles: [{ id: "worker", label: "工人" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues.some((issue) => issue.startsWith("pools.1.id:"))).toBe(true);
  });

  it("容量越界时报出带路径的问题", () => {
    const result = parseConfig({
      version: 1,
      defaults: { pool: "dsf" },
      pools: [
        { id: "dsf", label: "池", capacity: 501, runtimes: { pi: { provider: "p", model: "m" } } },
      ],
      roles: [{ id: "worker", label: "工人" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues.some((issue) => issue.startsWith("pools.0.capacity:"))).toBe(true);
  });

  it("池不给任何运行时模型时报出带路径的问题", () => {
    const result = parseConfig({
      version: 1,
      defaults: { pool: "dsf" },
      pools: [{ id: "dsf", label: "池", capacity: 10, runtimes: {} }],
      roles: [{ id: "worker", label: "工人" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues.some((issue) => issue.startsWith("pools.0.runtimes:"))).toBe(true);
  });
});

describe("parseConfigText", () => {
  it("JSON 语法错时报出中文说明", () => {
    const result = parseConfigText("{not valid json");
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues).toHaveLength(1);
    expect(result.issues.some((issue) => issue.startsWith("配置文件不是合法的 JSON："))).toBe(true);
  });

  it("合法 JSON 交给 parseConfig 校验", () => {
    const result = parseConfigText(JSON.stringify(DEFAULT_CONFIG));
    expect(result.ok).toBe(true);
  });

  it("合法 JSON 但内容不合规时，问题原样透传", () => {
    const result = parseConfigText(JSON.stringify({ version: 1, pools: [], roles: [] }));
    expect(result.ok).toBe(false);
  });
});
