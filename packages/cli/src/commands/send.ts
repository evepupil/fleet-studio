import { API_PATHS, type SubmitResponse } from "@fleet/core";
import { COMMON_OPTIONS, parseCommandArgs, parsePositiveMinutes } from "../args.js";
import { createFleetClient } from "../client.js";
import type { CommandDeps } from "../context.js";
import { ensureDaemon } from "../daemon/discover.js";
import { CliUsageError, EXIT_CODE } from "../errors.js";
import { formatStatusLine } from "../format/statusLine.js";
import { resolveHome } from "../home.js";
import { readPromptBody } from "../prompt.js";
import { DEFAULT_WAIT_TOTAL_TIMEOUT_SEC, waitAndReport } from "./wait.js";

const SEND_OPTIONS = {
  "prompt-file": { type: "string" },
  timeout: { type: "string" },
  wait: { type: "boolean" },
} as const;

const SEND_HELP = `用法：fleet send <编号> [追加指令] [选项]
给一个已结束的苦工续接。

追加指令正文三选一（同 fleet run）：位置参数、--prompt-file <文件>、- （从标准输入读到结束）。

选项：
  --timeout <分钟>  这次运行的超时
  --wait           发完接着等，等同 fleet wait 这一个编号
  --json           原样输出接口返回的 JSON
  --home <目录>     覆盖数据目录`;

export async function runSendCommand(argv: readonly string[], deps: CommandDeps): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: { ...COMMON_OPTIONS, ...SEND_OPTIONS },
    allowPositionals: true,
  });

  if (values.help) {
    deps.io.stdout(SEND_HELP);
    return EXIT_CODE.ok;
  }

  const [workerId, ...rest] = positionals;
  if (workerId === undefined) {
    throw new CliUsageError("请给出要续接的苦工编号");
  }

  const home = resolveHome(values.home, deps.env);
  const prompt = await readPromptBody(
    { positionals: rest, promptFile: values["prompt-file"] },
    deps.stdin,
  );
  const timeoutMin = parsePositiveMinutes(values.timeout, "--timeout");

  const daemon = await ensureDaemon(home, deps.env);
  const client = createFleetClient(daemon.baseUrl, daemon.token);
  const { worker } = await client.postJson<SubmitResponse>(API_PATHS.workerMessages(workerId), {
    prompt,
    timeoutMin,
  });

  const wantsJson = values.json === true;
  if (!wantsJson) {
    deps.io.stdout(formatStatusLine(worker, deps.now()));
  }

  if (values.wait !== true) {
    if (wantsJson) {
      deps.io.stdout(JSON.stringify({ worker }, null, 2));
    }
    return EXIT_CODE.ok;
  }
  return waitAndReport(
    [worker.id],
    { mode: "all", totalTimeoutSec: DEFAULT_WAIT_TOTAL_TIMEOUT_SEC, brief: false, json: wantsJson },
    client,
    deps.io,
    deps.now,
  );
}
