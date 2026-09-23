// fleet 命令对外导出（见 命令行层-fleet命令 模块设计）：主要给测试直接调用 runFleetCli，
// 真正的可执行入口是 main.ts 底部的自执行判断，bin 指向的是编译后的 dist/main.js。

export type { CommandDeps } from "./context.js";
export { CliConnectionError, CliUsageError, EXIT_CODE, type ExitCode } from "./errors.js";
export { type CliIo, createProcessIo } from "./io.js";
export { runFleetCli } from "./main.js";
