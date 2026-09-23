import {
  API_PATHS,
  FAIL_REASON_LABELS,
  WAIT_MAX_SECONDS,
  type WaitResult,
  type WorkerDetail,
  type WorkerSummary,
} from "@fleet/core";
import { COMMON_OPTIONS, parseCommandArgs } from "../args.js";
import type { FleetClient } from "../client.js";
import { createFleetClient } from "../client.js";
import type { CommandDeps } from "../context.js";
import { ensureDaemon } from "../daemon/discover.js";
import { CliUsageError, EXIT_CODE } from "../errors.js";
import { formatFinalText } from "../format/report.js";
import { formatStatusLine } from "../format/statusLine.js";
import { resolveHome } from "../home.js";
import type { CliIo } from "../io.js";

/** run/send 的 --wait 复用这套逻辑时的默认总超时，单位秒（规格 3.4 wait）。 */
export const DEFAULT_WAIT_TOTAL_TIMEOUT_SEC = 540;

const WAIT_OPTIONS = {
  any: { type: "boolean" },
  timeout: { type: "string" },
  brief: { type: "boolean" },
} as const;

const WAIT_HELP = `用法：fleet wait <编号...> [选项]
循环等待苦工结束。

选项：
  --any             任一个结束就算完成，默认要求全部结束
  --timeout <秒>    总超时，0 表示一直等，默认 540
  --brief           不打印回报原文
  --json            原样输出接口返回的 JSON
  --home <目录>      覆盖数据目录`;

export interface WaitOptions {
  readonly mode: "all" | "any";
  /** 0 表示一直等。 */
  readonly totalTimeoutSec: number;
  readonly brief: boolean;
  readonly json: boolean;
}

function parseNonNegativeSeconds(raw: string, flagName: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new CliUsageError(`${flagName} 必须是不小于 0 的秒数，收到：${raw}`);
  }
  return value;
}

/** 单次 /api/wait 最多挂 WAIT_MAX_SECONDS 秒；不超过命令自己剩余的总预算。 */
export function computePerCallTimeoutSec(remainingBudgetMs: number | undefined): number {
  if (remainingBudgetMs === undefined) {
    return WAIT_MAX_SECONDS;
  }
  return Math.max(1, Math.min(WAIT_MAX_SECONDS, Math.ceil(remainingBudgetMs / 1000)));
}

/**
 * 客户端请求超时要比服务端承诺挂住的时间长，否则服务端还没来得及按 timeoutSec 回应，
 * 客户端自己先把连接掐断了（表现为「连不上服务：This operation was aborted」，缺陷 7）。
 * 留 15 秒余量给网络往返和服务端处理；导出这个函数是为了能直接用小数值单测这条公式，
 * 不用真的等 timeoutSec 跑到接近一分钟。
 */
export const WAIT_REQUEST_TIMEOUT_BUFFER_MS = 15_000;

export function computeWaitRequestTimeoutMs(timeoutSec: number): number {
  return timeoutSec * 1000 + WAIT_REQUEST_TIMEOUT_BUFFER_MS;
}

function describeFailure(worker: WorkerSummary): string {
  const reasonLabel =
    worker.failReason !== null ? FAIL_REASON_LABELS[worker.failReason] : "未知原因";
  return worker.errorMessage !== null && worker.errorMessage.length > 0
    ? `${reasonLabel}：${worker.errorMessage}`
    : reasonLabel;
}

/** 失败时打一行原因说明；不带 --brief 时再补一次请求拿最新一次运行的回报原文。 */
async function reportWorkerOutcome(
  worker: WorkerSummary,
  client: FleetClient,
  io: CliIo,
  brief: boolean,
  now: Date,
): Promise<void> {
  io.stdout(formatStatusLine(worker, now));
  if (worker.status === "failed") {
    io.stdout(describeFailure(worker));
  }
  if (!brief) {
    const detail = await client.getJson<WorkerDetail>(API_PATHS.worker(worker.id));
    const latestRun = detail.runs.find((run) => run.seq === worker.runSeq) ?? null;
    io.stdout(formatFinalText(latestRun !== null ? latestRun.finalText : null));
  }
}

/**
 * 总超时到了但还有苦工没结束：打一行汇总，再逐个把还没结束的苦工的状态行打出来，
 * 不然主会话只看到退出码 2，不知道具体是谁没完成（缺陷 4）。
 */
async function reportTimeoutPending(
  pendingIds: readonly string[],
  client: FleetClient,
  io: CliIo,
  now: Date,
): Promise<void> {
  io.stdout(`等待超时，还有 ${pendingIds.length} 个苦工没结束：${pendingIds.join("、")}`);
  for (const id of pendingIds) {
    try {
      const detail = await client.getJson<WorkerDetail>(API_PATHS.worker(id));
      io.stdout(formatStatusLine(detail.summary, now));
    } catch {
      // 取不到详情（例如恰好这期间苦工被清理掉了）不影响超时提示本身，跳过继续下一个。
    }
  }
}

/**
 * 循环调用 /api/wait 直到给定的苦工都结束（或 mode 是 any 时有一个结束）或总超时。
 * run --wait、send --wait 复用的就是这个函数：跟单独执行 fleet wait <这一个编号> 是同一段代码。
 */
export async function waitAndReport(
  ids: readonly string[],
  options: WaitOptions,
  client: FleetClient,
  io: CliIo,
  now: () => Date,
): Promise<number> {
  const remainingIds = new Set(ids);
  const doneWorkers: WorkerSummary[] = [];
  const deadline = options.totalTimeoutSec > 0 ? Date.now() + options.totalTimeoutSec * 1000 : null;
  let timedOut = false;

  while (remainingIds.size > 0) {
    const remainingBudgetMs = deadline === null ? undefined : deadline - Date.now();
    if (remainingBudgetMs !== undefined && remainingBudgetMs <= 0) {
      timedOut = true;
      break;
    }

    const timeoutSec = computePerCallTimeoutSec(remainingBudgetMs);
    const result = await client.getJson<WaitResult>(
      API_PATHS.wait,
      { ids: [...remainingIds].join(","), mode: options.mode, timeoutSec },
      { timeoutMs: computeWaitRequestTimeoutMs(timeoutSec) },
    );

    for (const worker of result.done) {
      remainingIds.delete(worker.id);
      doneWorkers.push(worker);
      if (!options.json) {
        await reportWorkerOutcome(worker, client, io, options.brief, now());
      }
    }

    if (options.mode === "any" && result.done.length > 0) {
      break;
    }
  }

  if (timedOut && !options.json) {
    await reportTimeoutPending([...remainingIds], client, io, now());
  }

  if (options.json) {
    io.stdout(JSON.stringify({ done: doneWorkers, pending: [...remainingIds], timedOut }, null, 2));
  }

  if (timedOut) {
    return EXIT_CODE.timeout;
  }
  return doneWorkers.some((worker) => worker.status === "failed" || worker.status === "cancelled")
    ? EXIT_CODE.failure
    : EXIT_CODE.ok;
}

export async function runWaitCommand(argv: readonly string[], deps: CommandDeps): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: { ...COMMON_OPTIONS, ...WAIT_OPTIONS },
    allowPositionals: true,
  });

  if (values.help) {
    deps.io.stdout(WAIT_HELP);
    return EXIT_CODE.ok;
  }
  if (positionals.length === 0) {
    throw new CliUsageError("请至少给出一个苦工编号");
  }

  const home = resolveHome(values.home, deps.env);
  const totalTimeoutSec =
    values.timeout !== undefined
      ? parseNonNegativeSeconds(values.timeout, "--timeout")
      : DEFAULT_WAIT_TOTAL_TIMEOUT_SEC;

  const daemon = await ensureDaemon(home, deps.env);
  const client = createFleetClient(daemon.baseUrl, daemon.token);

  return waitAndReport(
    positionals,
    {
      mode: values.any === true ? "any" : "all",
      totalTimeoutSec,
      brief: values.brief === true,
      json: values.json === true,
    },
    client,
    deps.io,
    deps.now,
  );
}
