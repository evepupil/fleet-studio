/**
 * rawEdit 单测（模块设计 8.2 / 8.5 节）：在配置文件原始 JSON 上启停池、重排池。
 * 重点是「其余字段、字段顺序、没写的默认值都原样保留」，所以断言里大量用
 * JSON.stringify 比较整体形状，而不只是看被改的那个字段。
 */
import { describe, expect, it } from "vitest";
import { reorderPoolsRaw, setPoolEnabledRaw } from "../../src/config/rawEdit.js";
import { isFleetError } from "../../src/domain/errors.js";

/** 测试用的原始配置：故意带自定义字段、注释性字段和不一样的字段顺序。 */
interface RawFixture {
  version: number;
  port: number;
  _note: string;
  pools: Record<string, unknown>[];
}

function rawFixture(): RawFixture {
  return {
    version: 1,
    port: 4870,
    // 用户手写的说明字段，解析后的 FleetConfig 里没有，必须原样保留
    _note: "手写备注",
    pools: [
      { id: "a", label: "池 A", capacity: 10, custom: { keep: true } },
      { id: "b", label: "池 B", capacity: 5, enabled: false },
      { id: "c", label: "池 C", capacity: 1 },
    ],
  };
}

/** 断言 run 抛出指定编号和 message 的 FleetError；没抛或抛错类型不对都会失败。 */
function expectFleetError(run: () => unknown, code: string, message: string): void {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(isFleetError(caught)).toBe(true);
  if (isFleetError(caught)) {
    expect(caught.code).toBe(code);
    expect(caught.message).toBe(message);
  }
}

describe("setPoolEnabledRaw", () => {
  it("停用写 enabled: false，其余字段和顺序原样", () => {
    const raw = rawFixture();
    const next = setPoolEnabledRaw(raw, "a", false) as Record<string, unknown>;
    expect(JSON.stringify(next)).toBe(
      JSON.stringify({
        version: 1,
        port: 4870,
        _note: "手写备注",
        pools: [
          { id: "a", label: "池 A", capacity: 10, custom: { keep: true }, enabled: false },
          { id: "b", label: "池 B", capacity: 5, enabled: false },
          { id: "c", label: "池 C", capacity: 1 },
        ],
      }),
    );
  });

  it("启用写 true 时删掉 enabled 字段", () => {
    const next = setPoolEnabledRaw(rawFixture(), "b", true) as {
      pools: Record<string, unknown>[];
    };
    expect(next.pools[1]).toEqual({ id: "b", label: "池 B", capacity: 5 });
    expect(next.pools[1]).not.toHaveProperty("enabled");
  });

  it("本来就是启用（没有 enabled 字段）时再启用一次也不加字段", () => {
    const next = setPoolEnabledRaw(rawFixture(), "a", true) as {
      pools: Record<string, unknown>[];
    };
    expect(next.pools[0]).not.toHaveProperty("enabled");
  });

  it("不修改入参", () => {
    const raw = rawFixture();
    const before = JSON.stringify(raw);
    setPoolEnabledRaw(raw, "a", false);
    setPoolEnabledRaw(raw, "b", true);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("顶层字段顺序不变", () => {
    const next = setPoolEnabledRaw(rawFixture(), "c", false) as Record<string, unknown>;
    expect(Object.keys(next)).toEqual(["version", "port", "_note", "pools"]);
  });
  it("池不存在时抛 FleetError(not_found)", () => {
    expectFleetError(
      () => setPoolEnabledRaw(rawFixture(), "missing", false),
      "not_found",
      "池不存在：missing",
    );
  });

  it("结构不对（不是对象 / 没有 pools / pools 不是数组）时抛 config_invalid", () => {
    const message = "配置文件结构不对：缺少 pools 数组";
    expectFleetError(() => setPoolEnabledRaw(null, "a", false), "config_invalid", message);
    expectFleetError(() => setPoolEnabledRaw("字符串", "a", false), "config_invalid", message);
    expectFleetError(() => setPoolEnabledRaw([], "a", false), "config_invalid", message);
    expectFleetError(() => setPoolEnabledRaw({}, "a", false), "config_invalid", message);
    expectFleetError(() => setPoolEnabledRaw({ pools: {} }, "a", false), "config_invalid", message);
  });
});

describe("reorderPoolsRaw", () => {
  it("按给定顺序重排，池对象本身原样搬过去", () => {
    const raw = rawFixture();
    const next = reorderPoolsRaw(raw, ["c", "a", "b"]) as {
      pools: { id: string }[];
      _note: unknown;
    };
    expect(next.pools.map((pool) => pool.id)).toEqual(["c", "a", "b"]);
    expect(next.pools[1]).toEqual(raw.pools[0]);
    expect(next.pools[2]).toEqual(raw.pools[1]);
    expect(next.pools[0]).toEqual(raw.pools[2]);
    expect(next._note).toBe("手写备注");
  });

  it("顺序不变时内容也一模一样", () => {
    const raw = rawFixture();
    const next = reorderPoolsRaw(raw, ["a", "b", "c"]);
    expect(JSON.stringify(next)).toBe(JSON.stringify(raw));
  });

  it("不修改入参", () => {
    const raw = rawFixture();
    const before = JSON.stringify(raw);
    reorderPoolsRaw(raw, ["b", "c", "a"]);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("少一个、多一个、重复、未知编号都抛 FleetError(conflict)", () => {
    const message = "池的列表已经变了，请刷新后再调顺序";
    expectFleetError(() => reorderPoolsRaw(rawFixture(), ["a", "b"]), "conflict", message);
    expectFleetError(
      () => reorderPoolsRaw(rawFixture(), ["a", "b", "c", "d"]),
      "conflict",
      message,
    );
    expectFleetError(() => reorderPoolsRaw(rawFixture(), ["a", "a", "b"]), "conflict", message);
    expectFleetError(() => reorderPoolsRaw(rawFixture(), ["a", "b", "x"]), "conflict", message);
  });

  it("结构不对时抛 config_invalid", () => {
    const message = "配置文件结构不对：缺少 pools 数组";
    expectFleetError(() => reorderPoolsRaw(null, []), "config_invalid", message);
    expectFleetError(() => reorderPoolsRaw({ pools: "不是数组" }, []), "config_invalid", message);
  });
});
