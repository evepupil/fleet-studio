import type { PoolHealth, PoolView, ProjectView, QueueShare } from "@fleet/core";
import { ProjectDot } from "../../components/ProjectDot";
import { Tip } from "../../components/Tip";
import { formatCost, formatTokens } from "../../lib/format";
import styles from "./PoolNumbers.module.css";

const {
  root,
  usedRow,
  usedNumber,
  usedNumberOver,
  overText,
  queuedRow,
  queuedNumber,
  healthRow,
  healthEntry,
  windowLabel,
  sep,
  entryLabel,
  numberDone,
  numberFailed,
  numberWarning,
  usageRow,
  queueTip,
  queueTipRow,
  queueTipName,
  queueTipCount,
} = styles;

export interface PoolNumbersProps {
  pool: PoolView;
  projectByKey: ReadonlyMap<string, ProjectView>;
}

type HealthTone = "done" | "failed" | "warning";

interface HealthEntry {
  label: string;
  value: number;
  tone: HealthTone;
}

/** 第 3 列：占用大数字、排队、健康度、今日用量四行，为 0 的行整行不显示。 */
export function PoolNumbers({ pool, projectByKey }: PoolNumbersProps) {
  const over = pool.running > pool.capacity;
  const cost = formatCost(pool.usageToday.costUsd);

  return (
    <div className={root}>
      <div className={usedRow}>
        <span data-pool-used className={usedNumber}>
          <span className={over ? usedNumberOver : undefined}>{pool.running}</span>
          {" / "}
          {pool.capacity}
        </span>
        {over && <span className={overText}>超出 {pool.running - pool.capacity}</span>}
      </div>
      {pool.queued > 0 && (
        <Tip content={<QueueTip shares={pool.queuedByProject} projectByKey={projectByKey} />}>
          <button type="button" className={queuedRow} data-pool-queued>
            排队 <span className={queuedNumber}>{pool.queued}</span>
          </button>
        </Tip>
      )}
      <HealthRow health={pool.health} />
      {pool.usageToday.totalTokens > 0 && (
        <div className={usageRow} data-pool-usage>
          今日 {formatTokens(pool.usageToday.totalTokens)} tokens
          {cost !== null && <> · {cost}</>}
        </div>
      )}
    </div>
  );
}

/** 10 分钟窗口里的健康度：完成 / 失败 / 重试，为 0 的项不写，全为 0 时整行不渲染。 */
function HealthRow({ health }: { health: PoolHealth }) {
  const entries: HealthEntry[] = [];
  if (health.completed > 0) {
    entries.push({ label: "完成", value: health.completed, tone: "done" });
  }
  if (health.failed > 0) {
    entries.push({ label: "失败", value: health.failed, tone: "failed" });
  }
  if (health.retrying > 0) {
    entries.push({ label: "重试", value: health.retrying, tone: "warning" });
  }
  if (entries.length === 0) {
    return null;
  }
  // CSS Modules 的类名经 noUncheckedIndexedAccess 推断为 string | undefined，
  // 这里如实声明成 string | undefined，而不是断言成 string——用法和 className 的既有写法一致。
  const toneClass: Record<HealthTone, string | undefined> = {
    done: numberDone,
    failed: numberFailed,
    warning: numberWarning,
  };
  return (
    <div className={healthRow} data-pool-health>
      <span className={windowLabel}>{health.windowMinutes} 分钟</span>
      {entries.map((entry, index) => (
        <span className={healthEntry} key={entry.label}>
          {index > 0 && <span className={sep}>·</span>}
          {/* 标签和数字之间要有真正的空格字符（不能只靠 CSS gap）：
              交互检查按 textContent 找子串「失败 9」这种写法，CSS gap 不会出现在 textContent 里。 */}
          <span className={entryLabel}>{entry.label}</span>{" "}
          <span className={toneClass[entry.tone]}>{entry.value}</span>
        </span>
      ))}
    </div>
  );
}

/** 排队行的提示卡：按项目列出排队数。 */
function QueueTip({
  shares,
  projectByKey,
}: {
  shares: readonly QueueShare[];
  projectByKey: ReadonlyMap<string, ProjectView>;
}) {
  return (
    <div className={queueTip}>
      {shares.map((share) => {
        const project = projectByKey.get(share.projectKey) ?? null;
        return (
          <div className={queueTipRow} key={share.projectKey}>
            <ProjectDot colorIndex={project?.colorIndex ?? 0} size={8} />
            <span className={queueTipName}>{project?.name ?? share.projectKey}</span>
            <span className={queueTipCount}>{share.count}</span>
          </div>
        );
      })}
    </div>
  );
}
