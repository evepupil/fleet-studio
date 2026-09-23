import type { RuntimeId } from "../domain/status.js";
import { opencodeAdapter } from "./opencode/index.js";
import { piAdapter } from "./pi/index.js";
import type { RuntimeAdapter } from "./types.js";

const ADAPTERS: Readonly<Record<RuntimeId, RuntimeAdapter>> = {
  pi: piAdapter,
  opencode: opencodeAdapter,
};

/** 按运行时编号取适配器。新增运行时只需在这里登记。 */
export function getRuntimeAdapter(id: RuntimeId): RuntimeAdapter {
  return ADAPTERS[id];
}
