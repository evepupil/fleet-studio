/**
 * pi 苦工运行时适配器：拼启动参数、解析 --mode json 事件流。
 * 详见 docs/模块设计/核心层-运行时适配.md 第 4 节。
 */

import type { RuntimeAdapter } from "../types.js";
import { buildLaunch, displayModel } from "./args.js";
import { createPiReducer, PI_MAX_CONSECUTIVE_FAILURES } from "./reducer.js";

export { PI_MAX_CONSECUTIVE_FAILURES };

export const piAdapter: RuntimeAdapter = {
  id: "pi",
  displayModel,
  buildLaunch,
  createReducer: createPiReducer,
};
