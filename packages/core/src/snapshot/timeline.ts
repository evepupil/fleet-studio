import type { RunRecord } from "../domain/records.js";
import { isTerminalStatus } from "../domain/status.js";
import type { TimelineDraft, TimelineEvent } from "../domain/timeline.js";

/** assembleTimeline 的输入：一次运行 + 这次运行解析出的草稿事件（按产生顺序排好）。 */
export interface RunDrafts {
  run: RunRecord;
  drafts: readonly TimelineDraft[];
}

/**
 * 把多次运行的草稿事件拼成一条完整时间线：按运行序号从小到大处理每次运行，
 * 运行开始前插一条 run_start，运行结束（终态）后补一条 run_end；
 * 所有事件的 seq 跨运行连续编号，从 0 开始。
 */
export function assembleTimeline(runs: readonly RunDrafts[]): TimelineEvent[] {
  // 排序前拷贝一份，不能修改调用方传进来的数组。
  const orderedRuns = [...runs].sort((a, b) => a.run.seq - b.run.seq);
  const events: TimelineEvent[] = [];
  let nextSeq = 0;

  const allocateSeq = (): number => {
    const value = nextSeq;
    nextSeq += 1;
    return value;
  };

  for (const { run, drafts } of orderedRuns) {
    events.push({
      kind: "run_start",
      seq: allocateSeq(),
      runSeq: run.seq,
      at: run.startedAt ?? run.queuedAt,
      prompt: run.prompt,
    });

    let lastDraftAt: string | null = null;
    for (const draft of drafts) {
      events.push(attachSeq(draft, run.seq, allocateSeq()));
      lastDraftAt = draft.at;
    }

    if (isTerminalStatus(run.status)) {
      events.push({
        kind: "run_end",
        seq: allocateSeq(),
        runSeq: run.seq,
        at: run.endedAt ?? lastDraftAt ?? run.startedAt ?? run.queuedAt,
        status: run.status,
        failReason: run.failReason,
        message: run.errorMessage,
      });
    }
  }

  return events;
}

/** 把草稿事件补上 seq / runSeq 还原成完整事件；单独包一个函数隔离联合类型的展开写法。 */
function attachSeq(draft: TimelineDraft, runSeq: number, seq: number): TimelineEvent {
  return { ...draft, runSeq, seq };
}
