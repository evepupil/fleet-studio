import type { Logger } from "../app/types.js";
import type { ServiceEvent } from "./service.js";
import type { EventBus } from "./types.js";

/**
 * 引擎的事件总线：接口层的 SSE 路由和引擎内部的 waiter 都订阅同一份实例。
 * 监听者可能是别人写的（例如 http 层转发给客户端），一个监听者抛错不能连累其它监听者
 * 或让触发事件的调用方（定时器、跟踪器）崩溃，所以逐个包 try/catch。
 */
export function createEventBus(logger: Logger): EventBus {
  const listeners = new Set<(event: ServiceEvent) => void>();

  return {
    emit(event: ServiceEvent): void {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          logger.error("事件监听者出错", error);
        }
      }
    },
    subscribe(listener: (event: ServiceEvent) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
