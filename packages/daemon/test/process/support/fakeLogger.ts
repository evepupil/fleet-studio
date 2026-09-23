/**
 * 测试用 Logger：只记消息文本，方便断言“有没有记日志”“记的是不是中文说明”。
 * 调用方自己保证传进来的 message 不含变量值——这是被测代码的责任，这里只负责如实记录。
 */

import type { Logger } from "../../../src/app/types.js";

export interface RecordedLog {
  level: "info" | "warn" | "error";
  message: string;
}

export interface FakeLogger extends Logger {
  readonly records: readonly RecordedLog[];
}

export function createFakeLogger(): FakeLogger {
  const records: RecordedLog[] = [];
  return {
    records,
    info(message: string): void {
      records.push({ level: "info", message });
    },
    warn(message: string): void {
      records.push({ level: "warn", message });
    },
    error(message: string): void {
      records.push({ level: "error", message });
    },
  };
}
