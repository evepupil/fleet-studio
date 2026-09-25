/**
 * 配置文件的读写与热更新（模块设计《服务层-调度引擎》4.2 节）：不存在就按默认值生成；
 * 首次内容不合法直接拒绝启动；之后按秒轮询修改时间，变了才重新解析，解析失败保留上一份
 * 有效配置。全部用同步文件调用：配置文件很小，读写按秒级节奏发生，同步阻塞的代价可以
 * 忽略，换来的是「不会有两次 poll 交叠执行」的简单性。
 *
 * 第二版（模块设计 8.4 节）：看板启停池、调顺序走 updateRaw——在文件原文上改，其余字段
 * 和写法原样保留；写之前先把当前原文备份到 <home>/config-backups/。
 */
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  DEFAULT_CONFIG,
  type FleetConfig,
  FleetError,
  parseConfig,
  parseConfigText,
} from "@fleet/core";
import { configBackupsDir } from "../app/paths.js";
import type { ConfigStore, Logger } from "../app/types.js";

/** 每秒检查一次文件修改时间；规格 4.2 节明确写了"每秒"，不做成可配置项。 */
const POLL_INTERVAL_MS = 1000;

/** 备份文件名前缀；按文件名排序时它排在所有备份之前，便于挑出最旧的几份。 */
const BACKUP_PREFIX = "config-";

/** 备份只留最近这么多份，再多就删最旧的。 */
const MAX_BACKUPS = 50;

/**
 * updateRaw 读原文和写回之间被外部改过时最多重来几次。读改写不是原子的，外部进程
 * （用户编辑器、命令行）在中间改了文件时，直接写回会把对方的修改覆盖掉。重来几次
 * 还撞车说明对方在持续写，这时报 conflict 让调用方稍后再试，不猜。
 */
const MAX_RAW_EDIT_RETRIES = 3;

/** 先写临时文件再改名，避免半截 JSON 被自己的轮询或者外部读取撞到。 */
function writeFileAtomicSync(file: string, content: string): void {
  const tempFile = `${file}.tmp-${randomBytes(4).toString("hex")}`;
  writeFileSync(tempFile, content, "utf8");
  renameSync(tempFile, file);
}

/** 序列化配置：两空格缩进加结尾换行。 */
function serializeConfig(config: unknown): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

function ensureConfigFileExists(file: string): void {
  if (existsSync(file)) {
    return;
  }
  writeFileAtomicSync(file, serializeConfig(DEFAULT_CONFIG));
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
 * 备份目录：store 只拿到 configFile，而布局约定配置文件就在 <home>/ 下，
 * 所以按配置文件所在目录套用 paths.ts 的同一套布局，避免两处各写一遍目录名。
 */
function backupsDirOf(file: string): string {
  return configBackupsDir(dirname(file));
}

/**
 * 备份文件名：ISO 时间戳里的冒号（Windows 文件名非法）和点换成短横，末尾再加序号。
 * 只精确到毫秒时同一毫秒内的两次写入会互相覆盖，序号从 1 开始往上找第一个没被占用的。
 * 序号补零到固定位数：排序按文件名（字典序），补零后同一毫秒内序号大的才会排在后面。
 */
function backupFileName(now: Date, sequence: number): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return `${BACKUP_PREFIX}${stamp}-${String(sequence).padStart(3, "0")}.json`;
}

/**
 * 把配置文件原文备份一份，再只保留最近的 MAX_BACKUPS 份。
 * 文件名按字典序排就是时间序（ISO 时间戳），所以从前面删掉多余的即可。
 */
function backupConfigFile(file: string, content: string, now: Date): void {
  const backupsDir = backupsDirOf(file);
  mkdirSync(backupsDir, { recursive: true });
  // 同一毫秒内的第二次备份不能覆盖第一次：序号从 1 开始找第一个还没被占用的名字。
  // 序号补零到固定位数，按字典序排序时同一毫秒内序号大的排在后面。
  for (let sequence = 1; ; sequence += 1) {
    const path = join(backupsDir, backupFileName(now, sequence));
    if (!existsSync(path)) {
      writeFileAtomicSync(path, content);
      break;
    }
  }

  const backups = readdirSync(backupsDir)
    .filter((name) => name.startsWith(BACKUP_PREFIX) && name.endsWith(".json"))
    .sort();
  for (const stale of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))) {
    // 单个备份删不掉（被外部占用）不该让这次配置写入失败，下一轮清理会再试。
    try {
      rmSync(join(backupsDir, stale));
    } catch {
      // 忽略
    }
  }
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

  /**
   * 写回并立即生效：备份原文 → 原子写 → 更新内存状态、清错误、记下新 mtime
   * （避免被自己的轮询当成外部改动再通知一遍）→ 通知订阅者。
   * written 是写进文件的内容（updateRaw 写编辑后的原始对象，save 写传进来的配置），
   * next 是它解析出来的生效配置；两者必须来自同一份内容。
   */
  function writeAndApply(written: unknown, next: FleetConfig): void {
    if (existsSync(file)) {
      backupConfigFile(file, readFileSync(file, "utf8"), new Date());
    }
    writeFileAtomicSync(file, serializeConfig(written));
    current = next;
    lastError = null;
    knownMtimeMs = readMtimeMs(file);
    notify();
  }

  // 所有写入串成一条 Promise 链：同一时刻只有一个在写，两次 updateRaw 不会交叉读改写。
  let writeChain: Promise<void> = Promise.resolve();
  function enqueue(task: () => void): Promise<void> {
    const result = writeChain.then(task);
    // 链上继续挂的是"已吞掉异常"的版本，否则一次失败会让后面的写入全部连带失败。
    writeChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
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
    save(config: FleetConfig): Promise<void> {
      return enqueue(() => {
        writeAndApply(config, config);
      });
    },
    updateRaw(edit: (raw: unknown) => unknown): Promise<void> {
      return enqueue(() => {
        // 读改写期间文件可能被外部进程改动：每次重试都重新读原文、重新 edit、重新校验，
        // 保证写回的是「最新原文 + 这次编辑」，不会把外部修改覆盖掉。
        for (let attempt = 0; attempt <= MAX_RAW_EDIT_RETRIES; attempt += 1) {
          // 先取修改时间再读原文：两次读取之间被改过时，下面的复查会发现时间不一致。
          const mtimeBeforeEdit = readMtimeMs(file);
          // 读原文而不是用内存里的 current：用户手写的字段和写法只能从文件里拿到。
          const text = readFileSync(file, "utf8");
          let raw: unknown;
          try {
            raw = JSON.parse(text);
          } catch (error) {
            throw new FleetError(
              "config_invalid",
              `配置文件不是合法的 JSON：${describeError(error)}`,
            );
          }
          const edited = edit(raw);
          const result = parseConfig(edited);
          if (!result.ok) {
            throw new FleetError("config_invalid", result.issues.join("；"));
          }
          // 写临时文件之前再看一次修改时间：变了说明外部进程在中间改过文件，
          // 这次编辑是基于旧原文的，重来。
          if (readMtimeMs(file) === mtimeBeforeEdit) {
            // 写编辑后的原始对象而不是解析结果：zod 补齐过的对象会把用户手写的字段顺序和
            // 没写的默认值都固化下来，那就违背了 updateRaw 存在的理由。
            writeAndApply(edited, result.config);
            return;
          }
        }
        throw new FleetError("conflict", "配置文件正在被别处修改，请稍后再试");
      });
    },
    close(): void {
      clearInterval(timer);
    },
  };
}
