import type { DataSource, WorkerHandlers } from "../dataSource";
import { buildDemoScenario, DEMO_NOW_MS, type DemoScenarioName } from "./scenarios";

/** offline 场景先接通再掉线，验收断线提示条要看到从有到无的过程，不是一进来就断线。 */
const OFFLINE_DROP_DELAY_MS = 300;

const noop = (): void => undefined;

/** 把固定的演示场景包装成 DataSource：没有网络、没有增量，一次性把场景数据全部回放给订阅者。 */
export function createDemoDataSource(name: DemoScenarioName): DataSource {
  const scenario = buildDemoScenario(name);

  return {
    subscribeSnapshot(onSnapshot, onConnection) {
      onSnapshot(scenario.snapshot);
      onConnection("open");
      if (scenario.connection !== "lost") {
        return noop;
      }
      const timer = setTimeout(() => onConnection("lost"), OFFLINE_DROP_DELAY_MS);
      return () => clearTimeout(timer);
    },

    subscribeWorker(id, _after, handlers: WorkerHandlers) {
      const detail = scenario.details.get(id);
      if (detail === undefined) {
        handlers.onNotFound();
        return noop;
      }
      handlers.onDetail(detail);
      handlers.onEvents(scenario.timelines.get(id) ?? []);
      return noop;
    },

    fixedNow() {
      return DEMO_NOW_MS;
    },
  };
}
