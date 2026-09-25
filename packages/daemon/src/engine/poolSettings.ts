import { FleetError, type PoolView, reorderPoolsRaw, setPoolEnabledRaw } from "@fleet/core";
import type { EngineContext } from "./types.js";

export async function setPoolEnabled(
  ctx: EngineContext,
  id: string,
  enabled: boolean,
): Promise<PoolView> {
  await ctx.deps.config.updateRaw((raw) => setPoolEnabledRaw(raw, id, enabled));
  afterPoolSettingsChange(ctx);
  const pool = ctx.snapshots.get().pools.find((candidate) => candidate.id === id);
  if (pool === undefined) {
    throw new FleetError("internal", `保存配置后找不到池：${id}`);
  }
  return pool;
}

export async function reorderPools(
  ctx: EngineContext,
  poolIds: readonly string[],
): Promise<PoolView[]> {
  await ctx.deps.config.updateRaw((raw) => reorderPoolsRaw(raw, poolIds));
  afterPoolSettingsChange(ctx);
  return ctx.snapshots.get().pools;
}

function afterPoolSettingsChange(ctx: EngineContext): void {
  ctx.deps.host.invalidate();
  ctx.snapshots.markDirty();
  ctx.notifySnapshot();
  ctx.requestDispatch();
}
