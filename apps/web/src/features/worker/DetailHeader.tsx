import { FAIL_REASON_LABELS, type WorkerDetail } from "@fleet/core";
import { ArrowLeft } from "lucide-react";
import { CopyButton } from "../../components/CopyButton";
import { Duration } from "../../components/Duration";
import { StatusBadge } from "../../components/StatusBadge";
import { VerdictTag } from "../../components/VerdictTag";
import { useSelectionStore } from "../../state/selectionStore";
import styles from "./DetailHeader.module.css";

const {
  root,
  backButton,
  row1,
  title,
  idGroup,
  workerId,
  row2,
  duration,
  runSeqLabel,
  failure,
  failureReason,
  failureMessage,
} = styles;

export interface DetailHeaderProps {
  detail: WorkerDetail;
}

/**
 * 苦工详情头：标题、编号、状态与耗时、失败或取消说明。
 * 窄屏下顶部多一个返回按钮回到左栏列表；是否显示完全交给 CSS 媒体查询判断，不在 JS 里读窗口宽度。
 */
export function DetailHeader({ detail }: DetailHeaderProps) {
  const { summary } = detail;
  const select = useSelectionStore((state) => state.select);

  // 耗时规则同左栏苦工行第 1 行第 3 格：工作中实时刷新；排队中从排队时间起算、颜色更淡；终态定格在开跑到结束。
  const durationFrom = summary.startedAt ?? summary.queuedAt;
  const durationTo =
    summary.status === "running" || summary.status === "queued" ? null : summary.endedAt;
  const durationColor = summary.status === "queued" ? "var(--text-3)" : "var(--text-2)";

  const errorMessage = summary.errorMessage;
  const hasFailureNote =
    (summary.status === "failed" || summary.status === "cancelled") && errorMessage !== null;
  const failureBackground =
    summary.status === "failed" ? "var(--st-failed-soft)" : "var(--bg-raised)";

  return (
    <header className={root} data-detail-header>
      <button type="button" className={backButton} onClick={() => select(null)}>
        <ArrowLeft aria-hidden size={14} />
        返回
      </button>
      <div className={row1}>
        <h1 className={title} data-detail-title title={summary.title}>
          {summary.title}
        </h1>
        <div className={idGroup}>
          <span className={workerId}>{summary.id}</span>
          <CopyButton text={summary.id} label="复制编号" />
        </div>
      </div>
      <div className={row2}>
        <StatusBadge
          size="md"
          status={summary.status}
          retry={summary.retry}
          queuePosition={summary.queuePosition}
        />
        <span className={duration} style={{ color: durationColor }}>
          <Duration from={durationFrom} to={durationTo} />
        </span>
        {summary.verdict !== null && <VerdictTag verdict={summary.verdict} />}
        {summary.runSeq > 1 && <span className={runSeqLabel}>第 {summary.runSeq} 次运行</span>}
      </div>
      {hasFailureNote && errorMessage !== null && (
        <div
          className={failure}
          data-failure
          style={{ backgroundColor: failureBackground }}
          title={errorMessage}
        >
          {summary.failReason !== null && (
            <span className={failureReason}>{FAIL_REASON_LABELS[summary.failReason]}：</span>
          )}
          <span className={failureMessage}>{errorMessage}</span>
        </div>
      )}
    </header>
  );
}
