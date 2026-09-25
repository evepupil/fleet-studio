import type { DataSource } from "./dataSource";
import { createDemoDataSource } from "./demo/demoSource";
import { isDemoScenarioName } from "./demo/scenarios";
import { createLiveDataSource } from "./liveSource";

export function pickDataSource(search: string): DataSource {
  const demo = new URLSearchParams(search).get("demo");
  if (demo === "disabled") {
    return createDemoDataSource(demo);
  }
  if (demo !== null && isDemoScenarioName(demo)) {
    return createDemoDataSource(demo);
  }
  return createLiveDataSource();
}
