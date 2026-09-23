import type { LaunchFile, RuntimeId } from "@fleet/core";

/**
 * 进程托管层接口契约。调度引擎只依赖这里的接口，测试时可以换成假实现。
 */

/** 解析好的运行时可执行文件。 */
export interface ResolvedCommand {
  /** 可执行文件绝对路径，例如 node.exe 或 opencode.exe */
  executable: string;
  /** 放在运行时参数前面的固定参数，例如 pi 的入口脚本路径 */
  prefixArgs: string[];
  /** 进程映像名（小写文件名，例如 node.exe），接管时核对进程号用 */
  image: string;
}

export interface SpawnRequest {
  command: ResolvedCommand;
  /** 运行时参数（不含 prefixArgs） */
  args: string[];
  cwd: string;
  /** 子进程的完整环境变量 */
  env: Record<string, string>;
  /** stdout 原样追加写入的文件 */
  stdoutPath: string;
  /** stderr 原样追加写入的文件 */
  stderrPath: string;
  /** 启动前要写好的文件 */
  files: LaunchFile[];
}

export interface ProcessExitInfo {
  code: number | null;
  signal: string | null;
}

export interface SpawnedProcess {
  pid: number;
  image: string;
  /** 进程退出时回调一次；服务存活期间一定会触发 */
  onExit(listener: (exit: ProcessExitInfo) => void): void;
}

/**
 * 核对「这个进程号现在还是不是当初启动的那个进程」用的身份信息。
 * 进程号会被系统很快复用给新进程，认错的后果是把无关进程连同子进程树一起结束
 * （模块设计：服务层-进程托管 3.5）。
 */
export interface ProcessIdentity {
  /** 启动时记录的映像名，例如 node.exe；null 表示不核对 */
  image: string | null;
  /** 拿到进程号的时刻（Unix 毫秒），真正的进程创建时间一定不晚于它；null 表示不核对（旧记录没有） */
  spawnedAtMs: number | null;
}

export interface ProcessHost {
  /** 找到运行时的可执行文件；找不到抛 FleetError("runtime_unavailable") */
  resolve(runtime: RuntimeId): Promise<ResolvedCommand>;
  /** 分离启动苦工进程，输出直接写文件；启动失败抛 FleetError("invalid_request" 或 "runtime_unavailable") */
  spawn(request: SpawnRequest): Promise<SpawnedProcess>;
  /**
   * 结束整棵进程树；进程已不存在时静默返回。
   * identity 非 null 时先核对身份，这个号已属于别的进程就静默返回、绝不动它
   */
  kill(pid: number, identity: ProcessIdentity | null): Promise<void>;
  /** 进程是否还活着；identity 非 null 时还要核对映像名与创建时间，对不上视为不活 */
  isAlive(pid: number, identity: ProcessIdentity | null): Promise<boolean>;
  /** 给苦工用的环境变量：当前进程环境 + 注册表里的用户级、系统级变量（只补缺的） */
  workerEnv(): Promise<Record<string, string>>;
  /** 配置变化后丢掉缓存的可执行文件路径 */
  invalidate(): void;
}

/** 增量读取一个不断增长的输出文件。 */
export interface OutputTailer {
  /** 读出上次之后新增的完整行（已去掉行尾 \r\n 或 \n） */
  readNew(): Promise<string[]>;
  /** 文件不会再增长时调用：返回末尾不带换行的残行，没有则 null */
  flush(): string | null;
  /** 已经消费到的字节位置 */
  readonly offset: number;
}
