import type { Snapshot, TimelineEvent, WorkerDetail } from "@fleet/core";

/**
 * 数据源契约：看板不关心数据来自真实服务还是演示场景，只认这一组接口。
 * 真实实现见 liveSource.ts，演示实现见 demo/demoSource.ts，按地址参数二选一见 pickSource.ts。
 */

export type ConnectionState = "connecting" | "open" | "lost";

export interface WorkerHandlers {
  onDetail(detail: WorkerDetail): void;
  /** 按 seq 升序的新事件 */
  onEvents(events: TimelineEvent[]): void;
  onNotFound(): void;
  onError(message: string): void;
}

export interface DataSource {
  subscribeSnapshot(
    onSnapshot: (s: Snapshot) => void,
    onConnection: (c: ConnectionState) => void,
  ): () => void;
  /** 订阅单个苦工：先给详情，再给 seq > after 的历史事件，之后持续推增量 */
  subscribeWorker(id: string, after: number, handlers: WorkerHandlers): () => void;
  /** 演示数据源返回固定的「当前时刻」（毫秒），真实数据源返回 null */
  fixedNow(): number | null;
}
