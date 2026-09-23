import type { RunRecord } from "@fleet/core";
import type { ProcessIdentity } from "../process/types.js";
import { LAUNCH_TIMEOUT_MS } from "./launcher.js";

/**
 * 从运行记录拼出核对进程身份用的信息（模块设计：服务层-调度引擎 3.6 末尾）。
 * 结束和探测运行的进程之前，所有 `host.kill`、`host.isAlive` 调用都要带上它，
 * 防止进程号被系统复用后认错进程、误杀无关进程树。
 *
 * `spawnedAtMs` 三种取值：
 * - `run.spawnedAt` 非 null → 直接取它的毫秒值（launcher 拿到进程号那一刻记的）。
 * - `run.spawnedAt` 为 null 但 `run.startedAt` 非 null（升级前就在跑的旧记录）→
 *   用 `startedAt + LAUNCH_TIMEOUT_MS` 兜底：进程号只在启动阶段的这段赛跑之内才会写进库，
 *   所以任何写了进程号的运行，其真正的进程创建时间一定不晚于这个时刻。
 * - 两者都为 null（这次运行从没真正启动过）→ null，只核对映像名。
 */
export function identityOfRun(run: RunRecord): ProcessIdentity {
  const image = run.processImage;
  if (run.spawnedAt !== null) {
    return { image, spawnedAtMs: Date.parse(run.spawnedAt) };
  }
  if (run.startedAt !== null) {
    return { image, spawnedAtMs: Date.parse(run.startedAt) + LAUNCH_TIMEOUT_MS };
  }
  return { image, spawnedAtMs: null };
}
