import { API_PATHS, type PoolView, type Snapshot } from "@fleet/core";
import { COMMON_OPTIONS, parseCommandArgs } from "../args.js";
import { createFleetClient } from "../client.js";
import type { CommandDeps } from "../context.js";
import { ensureDaemon } from "../daemon/discover.js";
import { EXIT_CODE } from "../errors.js";
import { renderTable } from "../format/table.js";
import { resolveHome } from "../home.js";

const POOLS_HELP = `用法：fleet pools [--json]
按派活优先级列出每个模型池的状态、容量与最近健康状况。

选项：
  --json           原样输出接口返回的 JSON
  --home <目录>     覆盖数据目录`;

/**
 * 按优先级（配置里的先后，接口已按这个顺序返回）排；这里显式排一次，是为了不把展示顺序
 * 寄托在「接口恰好按顺序返回」这个隐含约定上。优先级相同时保持原顺序（Array.prototype.sort
 * 在 ES2019 之后是稳定排序）。
 */
function byPriority(pools: readonly PoolView[]): PoolView[] {
  return [...pools].sort((a, b) => a.priority - b.priority);
}

function poolRow(pool: PoolView): string[] {
  return [
    String(pool.priority),
    pool.id,
    pool.label,
    pool.enabled ? "启用" : "停用",
    `${pool.running}/${pool.capacity}`,
    String(pool.queued),
    pool.perProjectCap !== null ? String(pool.perProjectCap) : "不限",
    `${pool.health.completed}/${pool.health.failed}/${pool.health.retrying}`,
  ];
}

export async function runPoolsCommand(argv: readonly string[], deps: CommandDeps): Promise<number> {
  const { values } = parseCommandArgs({ args: argv, options: { ...COMMON_OPTIONS } });

  if (values.help) {
    deps.io.stdout(POOLS_HELP);
    return EXIT_CODE.ok;
  }

  const home = resolveHome(values.home, deps.env);
  const daemon = await ensureDaemon(home, deps.env);
  const client = createFleetClient(daemon.baseUrl, daemon.token);
  const pools = await client.getJson<PoolView[]>(API_PATHS.pools);

  if (values.json === true) {
    // --json 的契约就是「原样输出池数组」，不夹带别的东西，也就不必为公共排队多问一次快照。
    deps.io.stdout(JSON.stringify(pools, null, 2));
    return EXIT_CODE.ok;
  }

  // 公共排队数不在池数组里（它不属于任何一个池），规格第二版 3 说从快照的 sharedQueued 取。
  const snapshot = await client.getJson<Snapshot>(API_PATHS.snapshot);

  const lines = renderTable(
    [
      { header: "优先级" },
      { header: "编号" },
      { header: "显示名" },
      { header: "状态" },
      { header: "已用/容量" },
      { header: "排队数" },
      { header: "单项目上限" },
      { header: "最近10分钟完成/失败/重试中" },
    ],
    byPriority(pools).map(poolRow),
  );
  for (const line of lines) {
    deps.io.stdout(line);
  }
  if (snapshot.sharedQueued > 0) {
    deps.io.stdout(`公共排队 ${snapshot.sharedQueued} 个（没点名，等任一池空位）`);
  }
  return EXIT_CODE.ok;
}
