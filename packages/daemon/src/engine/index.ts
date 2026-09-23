/**
 * 调度引擎对外的唯一入口。服务装配那一路只从这里（或者直接从 engine.js）拿 createEngine，
 * 其余文件都是内部实现，不对外暴露。
 */
export { createEngine } from "./engine.js";
export type { FleetService, ServiceEvent, WaitMode } from "./service.js";
export type { Engine, EngineDeps } from "./types.js";
