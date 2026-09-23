/**
 * 测试用 Logger：只记消息文本，方便断言「有没有记日志」；不关心具体措辞时可以忽略内容。
 * 引擎单测自己的一份拷贝（任务书要求假日志放在 test/engine/fakes/，不借用其它模块的测试夹具）。
 */
import type { Logger } from "../../../src/app/types.js";

export interface RecordedLog {
  level: "info" | "warn" | "error";
  message: string;
  error?: unknown;
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
    error(message: string, error?: unknown): void {
      records.push({ level: "error", message, error });
    },
  };
}
