import { API_PATHS, type RunStatus, type WorkerSummary } from "@fleet/core";
import { COMMON_OPTIONS, parseCommandArgs } from "../args.js";
import { createFleetClient } from "../client.js";
import type { CommandDeps } from "../context.js";
import { ensureDaemon } from "../daemon/discover.js";
import { EXIT_CODE } from "../errors.js";
import { elapsedMs, formatDuration } from "../format/duration.js";
import { describeStatus, formatPoolSegment } from "../format/statusLine.js";
import { renderTable } from "../format/table.js";
import { resolveHome } from "../home.js";
import { resolveProject } from "../project.js";

const PS_OPTIONS = {
  all: { type: "boolean" },
  project: { type: "string" },
} as const;

const PS_HELP = `用法：fleet ps [选项]
列出苦工。

选项：
  --all            列出全部项目的苦工，默认只列当前项目
  --project <目录>  指定项目目录
  --json           原样输出接口返回的 JSON
  --home <目录>     覆盖数据目录`;

/** 标题列超过这个显示宽度就截断，避免长标题把表格撑到没法一屏看完。 */
const TITLE_MAX_WIDTH = 36;

/** 工作中最靠前，其次排队中，已结束垫底（缺陷 5 修正：三档分别定义组内顺序）。 */
function statusRank(status: RunStatus): number {
  if (status === "running") {
    return 0;
  }
  if (status === "queued") {
    return 1;
  }
  return 2;
}

/**
 * 进行中的在前、已结束的在后（规格 3.4 ps）：工作中按开跑时间从早到晚（跑得越久越显眼），
 * 排队中按排队位置从小到大；已结束按结束时间倒序——最近结束的排在已结束这组的最前面，
 * 而不是按编号字母序（缺陷 5：原实现把已结束的按结束时间从早到晚排反了）。
 */
function comparePsRows(a: WorkerSummary, b: WorkerSummary): number {
  const rankDiff = statusRank(a.status) - statusRank(b.status);
  if (rankDiff !== 0) {
    return rankDiff;
  }
  if (a.status === "running") {
    return (a.startedAt ?? "").localeCompare(b.startedAt ?? "");
  }
  if (a.status === "queued") {
    return (a.queuePosition ?? 0) - (b.queuePosition ?? 0);
  }
  return (b.endedAt ?? "").localeCompare(a.endedAt ?? "");
}

export async function runPsCommand(argv: readonly string[], deps: CommandDeps): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: { ...COMMON_OPTIONS, ...PS_OPTIONS },
  });

  if (values.help) {
    deps.io.stdout(PS_HELP);
    return EXIT_CODE.ok;
  }

  const home = resolveHome(values.home, deps.env);
  const projectFilter =
    values.all === true
      ? undefined
      : resolveProject({
          projectFlag: values.project,
          cwdFlag: undefined,
          env: deps.env,
          cwd: deps.cwd,
        }).projectPath;

  const daemon = await ensureDaemon(home, deps.env);
  const client = createFleetClient(daemon.baseUrl, daemon.token);
  const workers = await client.getJson<WorkerSummary[]>(API_PATHS.workers, {
    project: projectFilter,
  });

  if (values.json === true) {
    deps.io.stdout(JSON.stringify(workers, null, 2));
    return EXIT_CODE.ok;
  }

  const now = deps.now();
  const sorted = [...workers].sort(comparePsRows);
  const rows = sorted.map((worker) => [
    worker.id,
    describeStatus(worker),
    worker.roleLabel,
    formatPoolSegment(worker),
    formatDuration(elapsedMs(worker, now)),
    worker.title,
    worker.activity ?? "-",
  ]);
  const lines = renderTable(
    [
      { header: "编号" },
      { header: "状态" },
      { header: "角色" },
      { header: "池" },
      { header: "时长" },
      { header: "标题", maxWidth: TITLE_MAX_WIDTH },
      { header: "最近活动" },
    ],
    rows,
  );
  for (const line of lines) {
    deps.io.stdout(line);
  }
  return EXIT_CODE.ok;
}
