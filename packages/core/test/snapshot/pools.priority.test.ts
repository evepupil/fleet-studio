import { describe, expect, it } from "vitest";
import { buildPoolViews } from "../../src/snapshot/pools.js";
import { baseConfig } from "./fixtures.js";

const NOW = "2026-09-23T10:00:00.000Z";
const DAY_START = "2026-09-23T00:00:00.000Z";

describe("buildPoolViews：优先级 / 启停 / 渠道与模型名", () => {
  it("priority 等于池在配置里的下标 + 1，调换顺序后跟着变", () => {
    const config = baseConfig();
    const views = buildPoolViews(config.pools, [], [], config.roles, NOW, DAY_START);

    expect(views.map((v) => v.id)).toEqual(["fast", "oc"]);
    expect(views.map((v) => v.priority)).toEqual([1, 2]);

    const reordered = baseConfig({
      pools: [
        {
          id: "oc",
          label: "OC 池",
          capacity: 2,
          runtimes: { opencode: { model: "gpt-5-mini" } },
        },
        {
          id: "fast",
          label: "快速池",
          capacity: 4,
          runtimes: { pi: { provider: "mcgrox", model: "deepseek-v4.1-flash" } },
        },
      ],
    });
    const reorderedViews = buildPoolViews(reordered.pools, [], [], reordered.roles, NOW, DAY_START);

    expect(reorderedViews.map((v) => v.id)).toEqual(["oc", "fast"]);
    expect(reorderedViews.map((v) => v.priority)).toEqual([1, 2]);
  });

  it("enabled 照抄配置，停用的池仍然给出视图", () => {
    const config = baseConfig({
      pools: [
        {
          id: "fast",
          label: "快速池",
          capacity: 4,
          enabled: false,
          runtimes: { pi: { provider: "mcgrox", model: "deepseek-v4.1-flash" } },
        },
        {
          id: "oc",
          label: "OC 池",
          capacity: 2,
          runtimes: { opencode: { model: "gpt-5-mini" } },
        },
      ],
    });

    const views = buildPoolViews(config.pools, [], [], config.roles, NOW, DAY_START);

    expect(views.find((v) => v.id === "fast")?.enabled).toBe(false);
    expect(views.find((v) => v.id === "oc")?.enabled).toBe(true);
  });

  it("channel / modelName / model 取自 poolChannelModel，pi 优先", () => {
    const config = baseConfig();
    const views = buildPoolViews(config.pools, [], [], config.roles, NOW, DAY_START);
    const fast = views.find((v) => v.id === "fast");
    const oc = views.find((v) => v.id === "oc");

    // pi：渠道 = provider，模型 = model，显示名 = 渠道/模型。
    expect(fast).toMatchObject({
      model: "mcgrox/deepseek-v4.1-flash",
      channel: "mcgrox",
      modelName: "deepseek-v4.1-flash",
    });
    // opencode 的 model 里没有「/」：渠道退回池编号，显示名就是模型名本身。
    expect(oc).toMatchObject({ model: "gpt-5-mini", channel: "oc", modelName: "gpt-5-mini" });
  });
});
