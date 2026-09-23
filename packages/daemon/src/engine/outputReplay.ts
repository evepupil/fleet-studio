import type { OutputStream, RuntimeAdapter, TimelineDraft } from "@fleet/core";
import { createOutputTailer } from "../process/outputTailer.js";
import type { OutputTailer, StreamReducer } from "./types.js";

/**
 * 把一个还在增长的输出文件里「新出现的」内容喂给解析器：反复 readNew 直到读不到新行为止。
 * 跟踪器的每次轮询、以及下面的整份重放都靠它——单次 readNew 最多读 4MB，
 * 一次轮询之间可能积压超过这个上限（尤其是重放历史文件时），要循环到追平当前文件末尾。
 */
export async function drainNewLines(
  tailer: OutputTailer,
  stream: OutputStream,
  reducer: StreamReducer,
  at: string,
  drafts: TimelineDraft[],
): Promise<void> {
  for (;;) {
    const lines = await tailer.readNew();
    if (lines.length === 0) {
      return;
    }
    for (const line of lines) {
      drafts.push(...reducer.push(line, stream, at));
    }
  }
}

/**
 * 调用方确认这个文件不会再增长时才能调用：把残留的最后半行也交给解析器。
 * 对还在跟踪的运行（进程还活着）绝不能调用——半行之后文件还会继续增长，
 * flush 会提前把它当成一整行，后续真正写完这一行时反而会读少一段。
 */
export function flushRemainder(
  tailer: OutputTailer,
  stream: OutputStream,
  reducer: StreamReducer,
  at: string,
  drafts: TimelineDraft[],
): void {
  const remainder = tailer.flush();
  if (remainder !== null) {
    drafts.push(...reducer.push(remainder, stream, at));
  }
}

export interface ReplayResult {
  drafts: TimelineDraft[];
  reducer: StreamReducer;
  stdoutTailer: OutputTailer;
  stderrTailer: OutputTailer;
}

/**
 * 从头把 out.jsonl、err.log 读到当前末尾，喂给一个全新的解析器。
 * 用于两种场景：timelineStore 找不到 timeline.jsonl 时重建时间线；服务重启接管运行时重建进展。
 * 只追到「当前末尾」，不 flush 残留半行——是否已经可以 flush，由调用方按进程是否还活着决定
 * （还活着就要保留 tailer 继续跟踪，见 recovery.ts）。
 */
export async function replayRunOutput(
  outFile: string,
  errFile: string,
  adapter: RuntimeAdapter,
  at: string,
): Promise<ReplayResult> {
  const reducer = adapter.createReducer();
  const stdoutTailer = createOutputTailer(outFile, 0);
  const stderrTailer = createOutputTailer(errFile, 0);
  const drafts: TimelineDraft[] = [];
  await drainNewLines(stdoutTailer, "stdout", reducer, at, drafts);
  await drainNewLines(stderrTailer, "stderr", reducer, at, drafts);
  return { drafts, reducer, stdoutTailer, stderrTailer };
}
