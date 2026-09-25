import type { FleetConfig } from "@fleet/core";

/**
 * 服务装配层的接口契约：日志、数据目录布局、配置存取、运行信息文件。
 * 调度引擎和装配代码并行开发，都只依赖这里。
 */

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  /** error 可以是任意抛出物；实现负责取出堆栈，但绝不能记录环境变量的值 */
  error(message: string, error?: unknown): void;
}

/** 数据目录布局。所有路径都是绝对路径。 */
export interface DaemonPaths {
  home: string;
  configFile: string;
  daemonInfoFile: string;
  dbFile: string;
  logFile: string;
  runsDir: string;
  /** 这次运行专属的目录：runs/<运行编号>/ */
  runDir(runId: string): string;
  /** runs/<运行编号>/out.jsonl：苦工 stdout 原样 */
  outFile(runId: string): string;
  /** runs/<运行编号>/err.log：苦工 stderr 原样 */
  errFile(runId: string): string;
  /** runs/<运行编号>/timeline.jsonl：解析出的时间线草稿，每行一个 TimelineDraft */
  timelineFile(runId: string): string;
}

export interface ConfigStore {
  /** 当前生效的配置（配置文件改坏时仍是上一份有效配置） */
  current(): FleetConfig;
  /** 配置文件当前的错误说明；没错时为 null */
  error(): string | null;
  /** 配置生效内容或错误状态变化时回调；返回取消订阅函数 */
  onChange(listener: () => void): () => void;
  /** 写回配置文件并立即生效（写之前先备份，见 updateRaw） */
  save(config: FleetConfig): Promise<void>;
  /**
   * 在配置文件的原始 JSON 上做修改并写回、立即生效（第二版：看板启停池、调顺序用它）。
   * 读当前文件原文 → JSON.parse → edit(原始对象) → 用 parseConfig 校验结果（不合法抛 FleetError("config_invalid")，文件不动）
   * → 把当前文件复制到 <home>/config-backups/config-<UTC 时间，冒号换成短横>.json（只留最近 50 份）
   * → 两空格缩进写临时文件再改名替换 → 更新 current、通知订阅者。
   * 多次调用排队串行执行，不会交叉写。edit 抛出的 FleetError 原样抛给调用方。
   */
  updateRaw(edit: (raw: unknown) => unknown): Promise<void>;
  close(): void;
}

/** daemon.json 的内容：命令行靠它找到服务。 */
export interface DaemonInfo {
  pid: number;
  port: number;
  token: string;
  startedAt: string;
  version: string;
  home: string;
}
