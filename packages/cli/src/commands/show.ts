import { API_PATHS, STATUS_LABELS, type WorkerDetail } from "@fleet/core";
import { COMMON_OPTIONS, parseCommandArgs } from "../args.js";
import { createFleetClient } from "../client.js";
import type { CommandDeps } from "../context.js";
import { ensureDaemon } from "../daemon/discover.js";
import { CliUsageError, EXIT_CODE } from "../errors.js";
import { elapsedMs, formatDuration } from "../format/duration.js";
import { formatReportSections } from "../format/report.js";
import {
  describeFailureReason,
  describePoolAndModel,
  describeStatus,
} from "../format/statusLine.js";
import { formatUsage } from "../format/usage.js";
import { resolveHome } from "../home.js";

const SHOW_HELP = `用法：fleet show <编号> [--json]
看一个苦工的详情：标题、状态、目录、角色、运行时、池与模型、每次运行、用量与最新回报。

选项：
  --json           原样输出接口返回的 JSON
  --home <目录>     覆盖数据目录`;

function renderRunLines(detail: WorkerDetail, now: Date): string[] {
  return detail.runs.map((run) => {
    const duration = formatDuration(elapsedMs(run, now));
    return `  第${run.seq}次运行  ${STATUS_LABELS[run.status]}  ${duration}`;
  });
}

export async function runShowCommand(argv: readonly string[], deps: CommandDeps): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: { ...COMMON_OPTIONS },
    allowPositionals: true,
  });

  if (values.help) {
    deps.io.stdout(SHOW_HELP);
    return EXIT_CODE.ok;
  }
  const workerId = positionals[0];
  if (workerId === undefined) {
    throw new CliUsageError("请给出苦工编号");
  }

  const home = resolveHome(values.home, deps.env);
  const daemon = await ensureDaemon(home, deps.env);
  const client = createFleetClient(daemon.baseUrl, daemon.token);
  const detail = await client.getJson<WorkerDetail>(API_PATHS.worker(workerId));

  if (values.json === true) {
    deps.io.stdout(JSON.stringify(detail, null, 2));
    return EXIT_CODE.ok;
  }

  const now = deps.now();
  const { summary } = detail;
  const latestRun = detail.runs.at(-1) ?? null;

  deps.io.stdout(`标题：${summary.title}`);
  deps.io.stdout(`状态：${describeStatus(summary)}`);
  if (summary.status === "failed" || summary.status === "cancelled") {
    deps.io.stdout(`原因：${describeFailureReason(summary)}`);
  }
  deps.io.stdout(`项目目录：${detail.projectPath}`);
  deps.io.stdout(`工作目录：${summary.cwd}`);
  deps.io.stdout(`角色：${summary.roleLabel}`);
  // 「运行时与模型」拆成两行（规格第二版 2 把池与模型单列一行）：运行时单独一行，
  // 不然模型换成「公共排队（还没分到池）」时，运行时这个信息就没地方放了。
  deps.io.stdout(`运行时：${summary.runtime}`);
  deps.io.stdout(`池与模型：${describePoolAndModel(summary)}`);
  deps.io.stdout("每次运行：");
  for (const line of renderRunLines(detail, now)) {
    deps.io.stdout(line);
  }
  deps.io.stdout(`用量与费用：${formatUsage(summary.usage)}`);
  deps.io.stdout("最新回报：");
  deps.io.stdout(formatReportSections(latestRun?.report ?? null));

  return EXIT_CODE.ok;
}
