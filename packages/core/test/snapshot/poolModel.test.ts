import { describe, expect, it } from "vitest";
import { poolDisplayModel } from "../../src/snapshot/poolModel.js";
import { baseConfig } from "./fixtures.js";

describe("poolDisplayModel", () => {
  it("池配了 pi 模型时，显示 <provider>/<model>", () => {
    const pool = baseConfig().pools.find((p) => p.id === "fast");
    expect(pool).toBeDefined();
    if (!pool) return;

    expect(poolDisplayModel(pool)).toBe("mcgrox/deepseek-v4.1-flash");
  });

  it("池只配了 opencode 模型时，显示 opencode 的 model", () => {
    const pool = baseConfig().pools.find((p) => p.id === "oc");
    expect(pool).toBeDefined();
    if (!pool) return;

    expect(poolDisplayModel(pool)).toBe("gpt-5-mini");
  });
});
