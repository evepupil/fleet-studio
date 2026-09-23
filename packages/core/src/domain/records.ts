import type { FailReason, KilledBy, RunStatus, RuntimeId, ThinkingLevel } from "./status.js";
import type { Usage } from "./usage.js";

/** 项目：苦工归属的目录，看板按它分组。 */
export interface ProjectRecord {
  /** 归一化后的小写路径，作为主键（Windows 路径不区分大小写） */
  key: string;
  /** 归一化后保留原始大小写的路径，用于显示 */
  path: string;
  /** 目录名 */
  name: string;
  /** 在项目调色板里的位置，同一项目颜色固定 */
  colorIndex: number;
  createdAt: string;
}

/** 苦工：一份派出去的活，对应一个可续接的 pi / opencode 会话。 */
export interface WorkerRecord {
  /** 例如 w7k2mq */
  id: string;
  projectKey: string;
  /** 苦工实际干活的目录，可以和项目目录不同 */
  cwd: string;
  title: string;
  /** 角色编号 */
  role: string;
  runtime: RuntimeId;
  poolId: string;
  /** 显示用的模型名，例如 mcgrox/deepseek-v4.1-flash */
  model: string;
  /** null 表示沿用运行时自己的默认档位 */
  thinking: ThinkingLevel | null;
  /** pi：fleet-<苦工编号>；opencode：首次运行里拿到的会话编号，拿到之前为 null */
  sessionRef: string | null;
  createdAt: string;
  /** 最新一次运行的序号，从 1 开始 */
  latestRunSeq: number;
}

export interface RetryInfo {
  /** 第几次重试，从 1 开始 */
  attempt: number;
  max: number;
  message: string;
}

/** 运行：苦工的一次进程执行。第一次派活是第 1 次运行，每次续接加一次。 */
export interface RunRecord {
  /** <苦工编号>.<序号>，例如 w7k2mq.2 */
  id: string;
  workerId: string;
  seq: number;
  /** 这次运行收到的完整任务（第 1 次）或追加指令（之后） */
  prompt: string;
  status: RunStatus;
  failReason: FailReason | null;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  endedAt: string | null;
  timeoutMs: number;
  /** null 表示排队不限时 */
  queueTimeoutMs: number | null;
  pid: number | null;
  /** 启动时记录的进程映像名，例如 node.exe，接管时用来核对进程号有没有被复用 */
  processImage: string | null;
  /**
   * 拿到进程号的时刻（spawn 返回之后立刻记）。真正的苦工进程创建时间一定不晚于它；
   * 结束和探测进程前，用它和映像名一起核对「这个进程号现在还是不是当初那个进程」——
   * 进程号会被系统很快复用，只看映像名挡不住同样是 node.exe 的无关进程
   */
  spawnedAt: string | null;
  exitCode: number | null;
  killedBy: KilledBy;
  usage: Usage;
  /** 正在自动重试时的信息；不在重试时为 null */
  retry: RetryInfo | null;
  /** 最近一条工具调用的摘要，例如「bash · pnpm test」 */
  activity: string | null;
  lastActivityAt: string | null;
  /** 最后一条模型文字，也就是回报原文 */
  finalText: string | null;
  /** 这次运行已产生的时间线事件数 */
  eventCount: number;
}
