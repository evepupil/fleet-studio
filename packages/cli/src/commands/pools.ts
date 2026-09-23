import { API_PATHS, type PoolView } from "@fleet/core";
import { COMMON_OPTIONS, parseCommandArgs } from "../args.js";
import { createFleetClient } from "../client.js";
import type { CommandDeps } from "../context.js";
import { ensureDaemon } from "../daemon/discover.js";
import { EXIT_CODE } from "../errors.js";
import { renderTable } from "../format/table.js";
import { resolveHome } from "../home.js";

const POOLS_HELP = `用法：fleet pools [--json]
列出每个模型池的容量与最近健康状况。

选项：
  --json           原样输出接口返回的 JSON
  --home <目录>     覆盖数据目录`;

function poolRow(pool: PoolView): string[] {
  return [
    pool.id,
    pool.label,
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
    deps.io.stdout(JSON.stringify(pools, null, 2));
    return EXIT_CODE.ok;
  }

  const lines = renderTable(
    [
      { header: "编号" },
      { header: "显示名" },
      { header: "已用/容量" },
      { header: "排队数" },
      { header: "单项目上限" },
      { header: "最近10分钟完成/失败/重试中" },
    ],
    pools.map(poolRow),
  );
  for (const line of lines) {
    deps.io.stdout(line);
  }
  return EXIT_CODE.ok;
}
