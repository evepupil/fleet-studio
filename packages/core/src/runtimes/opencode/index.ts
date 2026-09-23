/** opencode 运行时适配器：拼启动参数、建立事件流解析器。 */
import type { RuntimeAdapter } from "../types.js";
import { buildLaunch, displayModel } from "./args.js";
import { createOpencodeReducer } from "./reducer.js";

export const opencodeAdapter: RuntimeAdapter = {
  id: "opencode",
  displayModel,
  buildLaunch,
  createReducer: createOpencodeReducer,
};
