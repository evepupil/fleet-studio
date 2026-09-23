/**
 * 服务装配层的汇总导出：数据目录、日志、daemon.json、配置存取、常驻服务启动入口。
 * 存储、进程托管、接口层、调度引擎各有自己的 index.ts（或者还没落盘），测试按需直接
 * 从那些路径导入，这里不重复汇总。
 */
export { readDaemonInfo, removeDaemonInfoIfOwned, writeDaemonInfo } from "./app/daemonInfo.js";
export type { FileLoggerOptions } from "./app/logger.js";
export { createFileLogger } from "./app/logger.js";
export { resolveDaemonPaths } from "./app/paths.js";
export type { DaemonHandle, StartDaemonOptions } from "./app/startDaemon.js";
export { startDaemon } from "./app/startDaemon.js";
export type { ConfigStore, DaemonInfo, DaemonPaths, Logger } from "./app/types.js";
export { openConfigStore } from "./config/configStore.js";
