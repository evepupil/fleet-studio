import type { ProjectRecord, RunRecord, WorkerRecord } from "@fleet/core";

/**
 * 存储层接口契约。调度引擎只依赖这里的接口，测试时可以换成内存实现。
 * 所有时间参数都是 ISO 8601 UTC 字符串；数据库里的时间也按这个格式存，字符串比较即时间比较。
 */

export interface ProjectRepo {
  get(key: string): ProjectRecord | null;
  insert(project: ProjectRecord): void;
  list(): ProjectRecord[];
  /** 自 since 以来有苦工创建的项目所占用的配色位置，用于给新项目挑不撞色的颜色 */
  colorIndicesInUse(since: string): number[];
  /** 删除没有任何苦工、且创建时间早于 before 的项目，返回删除的个数 */
  deleteOrphansCreatedBefore(before: string): number;
}

/** 苦工可以修改的字段 */
export type WorkerPatch = Partial<Pick<WorkerRecord, "sessionRef" | "latestRunSeq">>;

export interface WorkerRepo {
  get(id: string): WorkerRecord | null;
  exists(id: string): boolean;
  insert(worker: WorkerRecord): void;
  update(id: string, patch: WorkerPatch): void;
  /** 按给定编号批量取，顺序不保证；不存在的编号忽略 */
  listByIds(ids: readonly string[]): WorkerRecord[];
  /** 按创建时间倒序取最近的苦工，可按项目过滤 */
  listRecent(limit: number, projectKey?: string): WorkerRecord[];
  /** 删除苦工及其全部运行（级联） */
  deleteMany(ids: readonly string[]): void;
}

/** 运行可以修改的字段（编号、所属苦工、序号、任务正文、排队时间创建后不再变） */
export type RunPatch = Partial<Omit<RunRecord, "id" | "workerId" | "seq" | "prompt" | "queuedAt">>;

export interface RunRepo {
  get(id: string): RunRecord | null;
  insert(run: RunRecord): void;
  update(id: string, patch: RunPatch): void;
  /** 某苦工的全部运行，按序号升序 */
  listByWorker(workerId: string): RunRecord[];
  /** 多个苦工的全部运行，按苦工编号、序号升序 */
  listByWorkers(workerIds: readonly string[]): RunRecord[];
  /** 状态为排队中或工作中的运行，按排队时间升序 */
  listActive(): RunRecord[];
  /** 结束时间不早于 since 的运行 */
  listEndedSince(since: string): RunRecord[];
  /** 开跑时间不早于 since 的运行 */
  listStartedSince(since: string): RunRecord[];
  /** 最新一次运行已是终态、且结束时间早于 before 的苦工编号（过期清理用） */
  listExpiredWorkerIds(before: string): string[];
}

export interface Repos {
  projects: ProjectRepo;
  workers: WorkerRepo;
  runs: RunRepo;
  /** 在一个事务里执行，出错整体回滚 */
  transaction<T>(fn: () => T): T;
  close(): void;
}
