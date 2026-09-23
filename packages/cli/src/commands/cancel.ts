import { API_PATHS, type WorkerSummary } from "@fleet/core";
import { COMMON_OPTIONS, parseCommandArgs } from "../args.js";
import { createFleetClient, FleetApiError } from "../client.js";
import type { CommandDeps } from "../context.js";
import { ensureDaemon } from "../daemon/discover.js";
import { CliUsageError, EXIT_CODE } from "../errors.js";
import { formatStatusLine } from "../format/statusLine.js";
import { resolveHome } from "../home.js";

const CANCEL_HELP = `用法：fleet cancel <编号...>
逐个取消苦工，一个失败不影响其他编号继续处理。

选项：
  --json           原样输出每个编号的处理结果
  --home <目录>     覆盖数据目录`;

interface CancelOutcome {
  readonly id: string;
  readonly ok: boolean;
  readonly worker?: WorkerSummary;
  readonly error?: { readonly code: string; readonly message: string };
}

export async function runCancelCommand(
  argv: readonly string[],
  deps: CommandDeps,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: { ...COMMON_OPTIONS },
    allowPositionals: true,
  });

  if (values.help) {
    deps.io.stdout(CANCEL_HELP);
    return EXIT_CODE.ok;
  }
  if (positionals.length === 0) {
    throw new CliUsageError("请至少给出一个苦工编号");
  }

  const home = resolveHome(values.home, deps.env);
  const daemon = await ensureDaemon(home, deps.env);
  const client = createFleetClient(daemon.baseUrl, daemon.token);
  const wantsJson = values.json === true;

  const outcomes: CancelOutcome[] = [];
  for (const id of positionals) {
    try {
      const { worker } = await client.postEmpty<{ worker: WorkerSummary }>(
        API_PATHS.workerCancel(id),
      );
      outcomes.push({ id, ok: true, worker });
      if (!wantsJson) {
        deps.io.stdout(formatStatusLine(worker, deps.now()));
      }
    } catch (error) {
      const description =
        error instanceof FleetApiError
          ? { code: error.code, message: error.message }
          : { code: "internal", message: error instanceof Error ? error.message : "未知错误" };
      outcomes.push({ id, ok: false, error: description });
      if (!wantsJson) {
        deps.io.stdout(`${id}  取消失败：${description.message}`);
      }
    }
  }

  if (wantsJson) {
    deps.io.stdout(JSON.stringify(outcomes, null, 2));
  }

  return outcomes.every((outcome) => outcome.ok) ? EXIT_CODE.ok : EXIT_CODE.failure;
}
