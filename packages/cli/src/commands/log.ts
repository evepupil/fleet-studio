import { API_PATHS, type TimelineEvent, type TimelinePage } from "@fleet/core";
import { COMMON_OPTIONS, parseCommandArgs, parsePositiveInteger } from "../args.js";
import { createFleetClient, type FleetClient } from "../client.js";
import type { CommandDeps } from "../context.js";
import { ensureDaemon } from "../daemon/discover.js";
import { CliUsageError, EXIT_CODE } from "../errors.js";
import { formatTimeline } from "../format/timeline.js";
import { resolveHome } from "../home.js";

const LOG_OPTIONS = {
  tail: { type: "string" },
} as const;

const LOG_HELP = `用法：fleet log <编号> [选项]
按时间顺序打印一个苦工的完整时间线。

选项：
  --tail <条数>    只看最后这么多条
  --json           原样输出时间线事件（应用 --tail 之后）
  --home <目录>     覆盖数据目录`;

/** 服务端单页最多给 2000 条（timelineQuerySchema 的上限），分页取完整个时间线。 */
const TIMELINE_PAGE_LIMIT = 2000;

async function fetchAllEvents(client: FleetClient, workerId: string): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];
  let after = -1;
  for (;;) {
    const page = await client.getJson<TimelinePage>(API_PATHS.workerTimeline(workerId), {
      after,
      limit: TIMELINE_PAGE_LIMIT,
    });
    events.push(...page.events);
    if (page.events.length < TIMELINE_PAGE_LIMIT) {
      break;
    }
    after = page.next;
  }
  return events;
}

export async function runLogCommand(argv: readonly string[], deps: CommandDeps): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: { ...COMMON_OPTIONS, ...LOG_OPTIONS },
    allowPositionals: true,
  });

  if (values.help) {
    deps.io.stdout(LOG_HELP);
    return EXIT_CODE.ok;
  }
  const workerId = positionals[0];
  if (workerId === undefined) {
    throw new CliUsageError("请给出苦工编号");
  }
  const tail = parsePositiveInteger(values.tail, "--tail");

  const home = resolveHome(values.home, deps.env);
  const daemon = await ensureDaemon(home, deps.env);
  const client = createFleetClient(daemon.baseUrl, daemon.token);

  const allEvents = await fetchAllEvents(client, workerId);
  const events = tail !== undefined ? allEvents.slice(-tail) : allEvents;

  if (values.json === true) {
    deps.io.stdout(JSON.stringify(events, null, 2));
    return EXIT_CODE.ok;
  }

  for (const line of formatTimeline(events)) {
    deps.io.stdout(line);
  }
  return EXIT_CODE.ok;
}
