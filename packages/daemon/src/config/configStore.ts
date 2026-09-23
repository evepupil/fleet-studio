/**
 * 配置文件的读写与热更新（模块设计《服务层-调度引擎》4.2 节）：不存在就按默认值生成；
 * 首次内容不合法直接拒绝启动；之后按秒轮询修改时间，变了才重新解析，解析失败保留上一份
 * 有效配置。全部用同步文件调用：配置文件很小，读写按秒级节奏发生，同步阻塞的代价可以
 * 忽略，换来的是「不会有两次 poll 交叠执行」的简单性。
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { DEFAULT_CONFIG, type FleetConfig, FleetError, parseConfigText } from "@fleet/core";
import type { ConfigStore, Logger } from "../app/types.js";

/** 每秒检查一次文件修改时间；规格 4.2 节明确写了"每秒"，不做成可配置项。 */
const POLL_INTERVAL_MS = 1000;

/** 先写临时文件再改名，避免半截 JSON 被自己的轮询或者外部读取撞到。 */
function writeFileAtomicSync(file: string, content: string): void {
  const tempFile = `${file}.tmp-${randomBytes(4).toString("hex")}`;
  writeFileSync(tempFile, content, "utf8");
  renameSync(tempFile, file);
}

function ensureConfigFileExists(file: string): void {
  if (existsSync(file)) {
    return;
  }
  writeFileAtomicSync(file, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
}

function readMtimeMs(file: string): number | null {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return null; // 文件暂时读不到（比如正被外部编辑器保存到一半），下一轮再看
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 打开配置文件：不存在就先写入默认配置；首次内容不合法直接抛错，服务不应该带着坏配置
 * 启动。之后每秒检查一次修改时间，没变就什么都不做；变了才重新解析——合法就替换当前
 * 配置并清空错误，不合法就保留上一份有效配置、只记下错误说明，两种情况都要通知订阅者。
 */
export function openConfigStore(file: string, logger: Logger): ConfigStore {
  ensureConfigFileExists(file);

  const initialResult = parseConfigText(readFileSync(file, "utf8"));
  if (!initialResult.ok) {
    throw new FleetError("config_invalid", `配置文件有错：${initialResult.issues.join("；")}`);
  }

  let current: FleetConfig = initialResult.config;
  let lastError: string | null = null;
  let knownMtimeMs = readMtimeMs(file);
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function poll(): void {
    const mtimeMs = readMtimeMs(file);
    if (mtimeMs === null || mtimeMs === knownMtimeMs) {
      return; // 读不到文件，或者和上次看到的一样：没有外部改动
    }
    knownMtimeMs = mtimeMs;

    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (error) {
      logger.warn(`配置文件读取失败，保留上一份有效配置：${describeError(error)}`);
      return;
    }
    const result = parseConfigText(text);
    if (result.ok) {
      current = result.config;
      lastError = null;
    } else {
      lastError = result.issues.join("；");
      logger.warn(`配置文件有错，保留上一份有效配置：${lastError}`);
    }
    notify();
  }

  const timer = setInterval(() => {
    try {
      poll();
    } catch (error) {
      logger.error("配置轮询失败", error);
    }
  }, POLL_INTERVAL_MS);

  return {
    current(): FleetConfig {
      return current;
    },
    error(): string | null {
      return lastError;
    },
    onChange(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async save(config: FleetConfig): Promise<void> {
      // 记下这次写入后的修改时间，这样下一轮轮询发现 mtime 没变，不会把自己刚写的
      // 这次改动误认成外部修改再通知一遍；但改动本身仍然要立即通知一次订阅者。
      writeFileAtomicSync(file, `${JSON.stringify(config, null, 2)}\n`);
      current = config;
      lastError = null;
      knownMtimeMs = readMtimeMs(file);
      notify();
    },
    close(): void {
      clearInterval(timer);
    },
  };
}
