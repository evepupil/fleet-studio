import type { DataSource } from "./dataSource";
import { createDemoDataSource } from "./demo/demoSource";
import { isDemoScenarioName } from "./demo/scenarios";
import { createLiveDataSource } from "./liveSource";

/** ?demo=busy|empty|failure|offline 用演示数据源；其他值或没有这个参数一律连真实服务。 */
export function pickDataSource(search: string): DataSource {
  const demo = new URLSearchParams(search).get("demo");
  if (demo !== null && isDemoScenarioName(demo)) {
    return createDemoDataSource(demo);
  }
  return createLiveDataSource();
}
