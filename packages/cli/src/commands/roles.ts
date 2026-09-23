import { API_PATHS, type RoleView } from "@fleet/core";
import { COMMON_OPTIONS, parseCommandArgs } from "../args.js";
import { createFleetClient } from "../client.js";
import type { CommandDeps } from "../context.js";
import { ensureDaemon } from "../daemon/discover.js";
import { EXIT_CODE } from "../errors.js";
import { renderTable } from "../format/table.js";
import { resolveHome } from "../home.js";

const ROLES_HELP = `用法：fleet roles [--json]
列出可用的角色。

选项：
  --json           原样输出接口返回的 JSON
  --home <目录>     覆盖数据目录`;

export async function runRolesCommand(argv: readonly string[], deps: CommandDeps): Promise<number> {
  const { values } = parseCommandArgs({ args: argv, options: { ...COMMON_OPTIONS } });

  if (values.help) {
    deps.io.stdout(ROLES_HELP);
    return EXIT_CODE.ok;
  }

  const home = resolveHome(values.home, deps.env);
  const daemon = await ensureDaemon(home, deps.env);
  const client = createFleetClient(daemon.baseUrl, daemon.token);
  const roles = await client.getJson<RoleView[]>(API_PATHS.roles);

  if (values.json === true) {
    deps.io.stdout(JSON.stringify(roles, null, 2));
    return EXIT_CODE.ok;
  }

  const lines = renderTable(
    [{ header: "角色编号" }, { header: "中文名" }, { header: "说明" }],
    roles.map((role: RoleView) => [role.id, role.label, role.description]),
  );
  for (const line of lines) {
    deps.io.stdout(line);
  }
  return EXIT_CODE.ok;
}
