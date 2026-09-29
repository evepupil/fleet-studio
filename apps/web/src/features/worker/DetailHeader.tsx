import { FAIL_REASON_LABELS, type WorkerDetail } from "@fleet/core";
import { Duration } from "@/components/Duration";
import { StatusBadge } from "@/components/StatusBadge";
import { VerdictTag } from "@/components/VerdictTag";

export interface DetailHeaderProps {
  detail: WorkerDetail;
}

/** 详情标题、状态与耗时、失败或取消说明。 */
export function DetailHeader({ detail }: DetailHeaderProps) {
  const { summary } = detail;
  const durationFrom = summary.startedAt ?? summary.queuedAt;
  const durationTo =
    summary.status === "running" || summary.status === "queued" ? null : summary.endedAt;
  const durationClass = summary.status === "queued" ? "text-fg-3" : "text-fg-2";
  const errorMessage = summary.errorMessage;
  const hasFailureNote =
    (summary.status === "failed" || summary.status === "cancelled") && errorMessage !== null;
  const failureBackgroundClass =
    summary.status === "failed" ? "bg-status-failed-soft" : "bg-raised";

  return (
    <header data-detail-header>
      <h1
        data-detail-title
        title={summary.title}
        className="line-clamp-3 break-words text-16 font-medium text-fg-1"
      >
        {summary.title}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusBadge
          size="md"
          status={summary.status}
          retry={summary.retry}
          queuePosition={summary.queuePosition}
          shared={summary.poolId === null}
        />
        <span className={`font-mono text-12 tabular-nums ${durationClass}`}>
          <Duration from={durationFrom} to={durationTo} />
        </span>
        {summary.verdict !== null && <VerdictTag verdict={summary.verdict} />}
        {summary.runSeq > 1 && (
          <span className="text-12 text-fg-3">第 {summary.runSeq} 次运行</span>
        )}
      </div>
      {hasFailureNote && errorMessage !== null && (
        <div
          data-failure
          title={errorMessage}
          className={`mt-3 rounded-md px-3 py-2 text-12 ${failureBackgroundClass}`}
        >
          {summary.failReason !== null && (
            <span className="font-medium text-fg-1">
              {FAIL_REASON_LABELS[summary.failReason]}：
            </span>
          )}
          <span className="line-clamp-4 whitespace-pre-wrap break-words text-fg-2">
            {errorMessage}
          </span>
        </div>
      )}
    </header>
  );
}
