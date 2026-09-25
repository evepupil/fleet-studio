import { describe, expect, it } from "vitest";
import { mergeTopN } from "../../src/stats/index.js";

interface Item {
  key: string;
  weight: number;
}

function item(key: string, weight: number): Item {
  return { key, weight };
}

/** 合并成一项，key 固定为 other，权重是其余之和（只用来验证 merge 收到了哪些项） */
function mergeRest(rest: readonly Item[]): Item {
  return { key: "other", weight: rest.reduce((sum, current) => sum + current.weight, 0) };
}

function keys(items: readonly Item[]): string[] {
  return items.map((current) => current.key);
}

describe("mergeTopN", () => {
  it("不足 n 项时原样返回排序结果，不调用 merge", () => {
    const items = [item("a", 1), item("b", 3)];
    let called = false;
    const result = mergeTopN(
      items,
      8,
      (current) => current.weight,
      (rest) => {
        called = true;
        return mergeRest(rest);
      },
    );
    expect(keys(result)).toEqual(["b", "a"]);
    expect(called).toBe(false);
  });

  it("正好 n 项时也不合并", () => {
    const items = [item("a", 1), item("b", 2), item("c", 3)];
    const result = mergeTopN(items, 3, (current) => current.weight, mergeRest);
    expect(keys(result)).toEqual(["c", "b", "a"]);
  });

  it("超过 n 项时返回前 n 项加一项「其他」", () => {
    const items = [item("a", 10), item("b", 9), item("c", 8), item("d", 7)];
    const result = mergeTopN(items, 2, (current) => current.weight, mergeRest);
    expect(keys(result)).toEqual(["a", "b", "other"]);
    expect(result[2]?.weight).toBe(15);
  });

  it("权重相同时保持原顺序", () => {
    const items = [item("a", 5), item("b", 5), item("c", 5), item("d", 5)];
    const result = mergeTopN(items, 2, (current) => current.weight, mergeRest);
    expect(keys(result)).toEqual(["a", "b", "other"]);
  });

  it("权重相同时「其他」里的项也按原顺序", () => {
    const items = [item("a", 5), item("b", 5), item("c", 5), item("d", 5), item("e", 5)];
    const seen: string[][] = [];
    mergeTopN(
      items,
      2,
      (current) => current.weight,
      (rest) => {
        seen.push(keys(rest));
        return mergeRest(rest);
      },
    );
    expect(seen).toEqual([["c", "d", "e"]]);
  });

  it("空数组返回空数组", () => {
    expect(mergeTopN([], 8, (current: Item) => current.weight, mergeRest)).toEqual([]);
  });

  it("不改动传入的数组", () => {
    const items = [item("a", 1), item("b", 2)];
    mergeTopN(items, 1, (current) => current.weight, mergeRest);
    expect(keys(items)).toEqual(["a", "b"]);
  });

  it("n 为 0 时全部并入「其他」", () => {
    const items = [item("a", 1), item("b", 2)];
    const result = mergeTopN(items, 0, (current) => current.weight, mergeRest);
    expect(result).toEqual([{ key: "other", weight: 3 }]);
  });
});
