import { FAIL_REASON_LABELS, type WorkerSummary } from "@fleet/core";
import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { Duration } from "../../components/Duration";
import { STATUS_META } from "../../lib/status";
import { useSelectionStore } from "../../state/selectionStore";
import styles from "./WorkerRow.module.css";

const {
  row,
  iconSlot,
  spin,
  reducedDot,
  title: titleClass,
  duration: durationClass,
  durationMuted,
  statusLine,
  dot,
  mono,
} = styles;

export interface WorkerRowProps {
  worker: WorkerSummary;
  selected: boolean;
}

interface StatusWord {
  text: string;
  color: string;
}

/** 行首状态图标下方那一行的状态词：重试中和带位置的排队要单独拼文案，其余照抄 STATUS_META。 */
function statusWord(worker: WorkerSummary): StatusWord {
  if (worker.status === "running" && worker.retry !== null) {
    return { text: `重试 ${worker.retry.attempt}/${worker.retry.max}`, color: "var(--st-warning)" };
  }
  if (worker.status === "queued") {
    const text = worker.queuePosition === null ? "排队中" : `排队第 ${worker.queuePosition} 位`;
    return { text, color: "var(--st-queued)" };
  }
  const meta = STATUS_META[worker.status];
  return { text: meta.label, color: meta.color };
}

interface Supplement {
  text: string;
  color: string;
  mono: boolean;
}

/** 第二行第三段补充信息：工作中的活动摘要、自评不通过、失败原因，其余状态不写。 */
function statusSupplement(worker: WorkerSummary): Supplement | null {
  if (worker.status === "running") {
    return worker.activity === null
      ? { text: "等待第一条输出", color: "var(--text-3)", mono: false }
      : { text: worker.activity, color: "var(--text-3)", mono: true };
  }
  if (worker.status === "completed" && worker.verdict === "fail") {
    return { text: "自评不通过", color: "var(--st-warning)", mono: false };
  }
  if (worker.status === "failed") {
    const reasonLabel = worker.failReason === null ? null : FAIL_REASON_LABELS[worker.failReason];
    const text =
      reasonLabel === null
        ? worker.errorMessage
        : worker.errorMessage === null
          ? reasonLabel
          : `${reasonLabel}：${worker.errorMessage}`;
    return text === null ? null : { text, color: "var(--text-3)", mono: false };
  }
  return null;
}

/** 第 1 行第 3 格的时长：工作中实时、排队中偏暗、终态取开跑或排队时间到结束时间。 */
function renderDuration(worker: WorkerSummary): ReactNode {
  if (worker.status === "running") {
    return <Duration from={worker.startedAt} />;
  }
  if (worker.status === "queued") {
    return (
      <span className={durationMuted}>
        <Duration from={worker.queuedAt} />
      </span>
    );
  }
  return <Duration from={worker.startedAt ?? worker.queuedAt} to={worker.endedAt} />;
}

/**
 * R5 苦工行：状态图标 + 标题 + 时长（第 1 行），状态词 · 角色 · 补充信息（第 2 行）。
 * 行首图标不用 StatusBadge（那是图标和文字拼在一起的独立组件），这里自己照第 3 章的动效规则做
 * 一遍：工作中旋转，prefers-reduced-motion 时换成静态圆点。
 */
export function WorkerRow({ worker, selected }: WorkerRowProps) {
  const select = useSelectionStore((state) => state.select);
  const retrying = worker.status === "running" && worker.retry !== null;
  const spinning = worker.status === "running";
  const Icon = retrying ? RotateCw : STATUS_META[worker.status].icon;
  const iconColor = retrying ? "var(--st-warning)" : STATUS_META[worker.status].color;
  const word = statusWord(worker);
  const supplement = statusSupplement(worker);

  return (
    <li>
      <button
        type="button"
        className={row}
        data-worker-row={worker.id}
        aria-current={selected ? "true" : undefined}
        onClick={() => select(worker.id)}
      >
        <span className={iconSlot}>
          <Icon
            aria-hidden
            size={14}
            style={{ color: iconColor }}
            className={spinning ? spin : undefined}
          />
          {spinning && <span className={reducedDot} aria-hidden />}
        </span>
        <span className={titleClass} title={worker.title}>
          {worker.title}
        </span>
        <span className={durationClass}>{renderDuration(worker)}</span>
        <span className={statusLine}>
          <span style={{ color: word.color }}>{word.text}</span>
          <span className={dot}> · </span>
          <span>{worker.roleLabel}</span>
          {supplement !== null && (
            <>
              <span className={dot}> · </span>
              <span
                className={supplement.mono ? mono : undefined}
                style={{ color: supplement.color }}
              >
                {supplement.text}
              </span>
            </>
          )}
        </span>
      </button>
    </li>
  );
}
