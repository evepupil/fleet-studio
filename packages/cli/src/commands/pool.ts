import { API_PATHS, type PoolView } from "@fleet/core";
import {
  COMMON_OPTIONS,
  parseCommandArgs,
  parseNonNegativeInteger,
  parsePositiveInteger,
} from "../args.js";
import { createFleetClient } from "../client.js";
import type { CommandDeps } from "../context.js";
import { ensureDaemon } from "../daemon/discover.js";
import { CliUsageError, EXIT_CODE } from "../errors.js";
import { resolveHome } from "../home.js";

const POOL_SET_OPTIONS = {
  capacity: { type: "string" },
  "per-project": { type: "string" },
} as const;

const POOL_HELP = `用法：fleet pool set <编号> [选项]
调整一个模型池的容量配置。

选项：
  --capacity <数>       同时在跑的上限，0 表示暂停放行
  --per-project <数|none>  单项目在这个池里的上限，none 表示不限
  --json                原样输出接口返回的 JSON
  --home <目录>          覆盖数据目录`;

function parsePerProjectCap(raw: string | undefined): number | null | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === "none") {
    return null;
  }
  return parsePositiveInteger(raw, "--per-project");
}

async function runPoolSetCommand(argv: readonly string[], deps: CommandDeps): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: { ...COMMON_OPTIONS, ...POOL_SET_OPTIONS },
    allowPositionals: true,
  });

  if (values.help) {
    deps.io.stdout(POOL_HELP);
    return EXIT_CODE.ok;
  }
  const poolId = positionals[0];
  if (poolId === undefined) {
    throw new CliUsageError("请给出池编号");
  }
  const capacity = parseNonNegativeInteger(values.capacity, "--capacity");
  const perProjectCap = parsePerProjectCap(values["per-project"]);
  if (capacity === undefined && perProjectCap === undefined) {
    throw new CliUsageError("请至少指定 --capacity 或 --per-project 之一");
  }

  const home = resolveHome(values.home, deps.env);
  const daemon = await ensureDaemon(home, deps.env);
  const client = createFleetClient(daemon.baseUrl, daemon.token);
  const pool = await client.patchJson<PoolView>(API_PATHS.pool(poolId), {
    capacity,
    perProjectCap,
  });

  if (values.json === true) {
    deps.io.stdout(JSON.stringify(pool, null, 2));
    return EXIT_CODE.ok;
  }
  deps.io.stdout(
    `${pool.id}  ${pool.label}  容量 ${pool.capacity}  单项目上限 ${pool.perProjectCap ?? "不限"}`,
  );
  return EXIT_CODE.ok;
}

/** fleet pool 目前只有一个子命令 set，先按这个结构留出扩展空间。 */
export async function runPoolCommand(argv: readonly string[], deps: CommandDeps): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub === "set") {
    return runPoolSetCommand(rest, deps);
  }
  if (sub === "--help") {
    deps.io.stdout(POOL_HELP);
    return EXIT_CODE.ok;
  }
  if (sub === undefined) {
    throw new CliUsageError("请给出 pool 的子命令：set");
  }
  throw new CliUsageError(`未知的 pool 子命令：${sub}`);
}
