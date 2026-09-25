import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reorderPools, setPoolEnabled } from "../../src/engine/poolSettings.js";
import { basePoolOf, createTestEngine, type TestEngine } from "./support/testEngine.js";

describe("poolSettings：池状态与优先级持久化", () => {
  let engine: TestEngine;

  beforeEach(async () => {
    engine = await createTestEngine();
  });

  afterEach(async () => {
    await engine.cleanup();
  });

  it("启停池通过 updateRaw 写回配置并刷新快照、托管缓存和派发", async () => {
    const poolId = basePoolOf(engine.config.current()).id;
    const dispatch = vi.fn();
    engine.ctx.requestDispatch = dispatch;
    const events: string[] = [];
    engine.ctx.events.subscribe((event) => events.push(event.type));
    const invalidations = engine.host.invalidateCallCount;

    const updated = await setPoolEnabled(engine.ctx, poolId, false);

    expect(updated).toMatchObject({ id: poolId, enabled: false });
    expect(engine.config.current().pools[0]?.enabled).toBe(false);
    expect(engine.config.saveCallCount).toBe(1);
    expect(engine.host.invalidateCallCount).toBe(invalidations + 1);
    expect(events).toContain("snapshot");
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("重排必须提供全部池的排列，成功后顺序即优先级", async () => {
    const config = engine.config.current();
    const first = basePoolOf(config);
    const second = { ...first, id: "secondary", label: "secondary" };
    engine.config.setConfig({ ...config, pools: [first, second] });
    const dispatch = vi.fn();
    engine.ctx.requestDispatch = dispatch;

    const updated = await reorderPools(engine.ctx, [second.id, first.id]);

    expect(updated.map((pool) => pool.id)).toEqual([second.id, first.id]);
    expect(engine.config.current().pools.map((pool) => pool.id)).toEqual([second.id, first.id]);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("过期或不完整的池顺序抛 conflict", async () => {
    const first = basePoolOf(engine.config.current());
    const second = { ...first, id: "secondary", label: "secondary" };
    engine.config.setConfig({ ...engine.config.current(), pools: [first, second] });

    await expect(reorderPools(engine.ctx, [first.id])).rejects.toMatchObject({ code: "conflict" });
    expect(engine.config.current().pools.map((pool) => pool.id)).toEqual([first.id, second.id]);
  });
});
