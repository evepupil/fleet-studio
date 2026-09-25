import { API_PATHS, RUNTIME_IDS, type SubmitResponse, THINKING_LEVELS } from "@fleet/core";
import {
  COMMON_OPTIONS,
  parseCommandArgs,
  parseEnumOption,
  parsePositiveMinutes,
} from "../args.js";
import { createFleetClient } from "../client.js";
import type { CommandDeps } from "../context.js";
import { ensureDaemon } from "../daemon/discover.js";
import { EXIT_CODE } from "../errors.js";
import { describePlacement, formatStatusLine } from "../format/statusLine.js";
import { resolveHome } from "../home.js";
import { resolveProject } from "../project.js";
import { readPromptBody } from "../prompt.js";
import { DEFAULT_WAIT_TOTAL_TIMEOUT_SEC, waitAndReport } from "./wait.js";

const RUN_OPTIONS = {
  "prompt-file": { type: "string" },
  project: { type: "string" },
  cwd: { type: "string" },
  pool: { type: "string" },
  runtime: { type: "string" },
  role: { type: "string" },
  title: { type: "string" },
  thinking: { type: "string" },
  timeout: { type: "string" },
  "queue-timeout": { type: "string" },
  wait: { type: "boolean" },
  brief: { type: "boolean" },
} as const;

const RUN_HELP = `用法：fleet run [任务] [选项]
派一个苦工去干活。

任务正文三选一：位置参数（多个用空格拼起来）、--prompt-file <文件>、- （从标准输入读到结束）。

选项：
  --project <目录>            苦工归属的项目目录，默认按当前目录向上找 .git
  --cwd <目录>                苦工实际干活的目录，默认当前目录
  --pool <编号>               点名模型池；不写就按池的优先级自动挑
  --runtime pi|opencode      指定运行时
  --role <编号>               指定角色
  --title <标题>              任务标题
  --thinking <档位>           思考档位
  --timeout <分钟>            运行超时
  --queue-timeout <分钟|none> 排队超时，none 表示不限时
  --wait                     派完接着等，等同 fleet wait 这一个编号
  --brief                    只在带 --wait 时生效：不打印回报原文
  --json                     原样输出接口返回的 JSON
  --home <目录>               覆盖数据目录`;

/** --queue-timeout 支持字面量 none（不限时）或正数分钟；不传时返回 undefined 表示沿用服务默认值。 */
function parseQueueTimeout(raw: string | undefined): number | null | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === "none") {
    return null;
  }
  return parsePositiveMinutes(raw, "--queue-timeout");
}

export async function runRunCommand(argv: readonly string[], deps: CommandDeps): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: { ...COMMON_OPTIONS, ...RUN_OPTIONS },
    allowPositionals: true,
  });

  if (values.help) {
    deps.io.stdout(RUN_HELP);
    return EXIT_CODE.ok;
  }

  const home = resolveHome(values.home, deps.env);
  const project = resolveProject({
    projectFlag: values.project,
    cwdFlag: values.cwd,
    env: deps.env,
    cwd: deps.cwd,
  });
  const prompt = await readPromptBody(
    { positionals, promptFile: values["prompt-file"] },
    deps.stdin,
  );
  const runtime = parseEnumOption(values.runtime, RUNTIME_IDS, "--runtime");
  const thinking = parseEnumOption(values.thinking, THINKING_LEVELS, "--thinking");
  const timeoutMin = parsePositiveMinutes(values.timeout, "--timeout");
  const queueTimeoutMin = parseQueueTimeout(values["queue-timeout"]);

  const daemon = await ensureDaemon(home, deps.env);
  const client = createFleetClient(daemon.baseUrl, daemon.token);
  const { worker } = await client.postJson<SubmitResponse>(API_PATHS.workers, {
    projectPath: project.projectPath,
    cwd: project.cwd,
    prompt,
    title: values.title,
    role: values.role,
    runtime,
    pool: values.pool,
    thinking,
    timeoutMin,
    queueTimeoutMin,
  });

  const wantsJson = values.json === true;
  if (!wantsJson) {
    // 规格 3.4：第一行只有编号方便脚本截取，第二行是状态行；--json 时这两行没有意义，
    // 只在最终结果里出现一份 JSON（见下面两个分支），避免一次调用打印出两段不同形状的 JSON。
    deps.io.stdout(worker.id);
    deps.io.stdout(formatStatusLine(worker, deps.now()));
    // 第三行说明现在落在哪个池（规格第二版 1）；带 --wait 时不打：下面的等待输出会接着说
    // 这个苦工后来怎么了，先说一句「排队中」反而容易被当成最终结果。
    if (values.wait !== true) {
      const placement = describePlacement(worker);
      if (placement !== null) {
        deps.io.stdout(placement);
      }
    }
  }

  if (values.wait !== true) {
    if (wantsJson) {
      deps.io.stdout(JSON.stringify({ worker }, null, 2));
    }
    return EXIT_CODE.ok;
  }
  return waitAndReport(
    [worker.id],
    {
      mode: "all",
      totalTimeoutSec: DEFAULT_WAIT_TOTAL_TIMEOUT_SEC,
      brief: values.brief === true,
      json: wantsJson,
    },
    client,
    deps.io,
    deps.now,
  );
}
