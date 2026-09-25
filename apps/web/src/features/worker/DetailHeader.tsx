import { FAIL_REASON_LABELS, type WorkerDetail } from "@fleet/core";
import { ArrowLeft, X } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { Duration } from "@/components/Duration";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { VerdictTag } from "@/components/VerdictTag";

export interface DetailHeaderProps {
  detail: WorkerDetail;
  onClose(): void;
}

/**
 * 苦工详情头：标题、编号、状态与耗时、失败或取消说明。
 * 宽屏关闭按钮在右上角；窄屏（< 1024px）换成左上角的「返回」按钮，两个按钮调用同一个 onClose，
 * 由 CSS 断点决定谁显示，不在 JS 里读窗口宽度。
 */
export function DetailHeader({ detail, onClose }: DetailHeaderProps) {
  const { summary } = detail;

  // 耗时规则同左栏苦工行第 1 行第 3 格：工作中实时刷新；排队中从排队时间起算、颜色更淡；终态定格在开跑到结束。
  const durationFrom = summary.startedAt ?? summary.queuedAt;
  const durationTo =
    summary.status === "running" || summary.status === "queued" ? null : summary.endedAt;
  const durationClass = summary.status === "queued" ? "text-fg-3" : "text-fg-2";

  const errorMessage = summary.errorMessage;
  const hasFailureNote =
    (summary.status === "failed" || summary.status === "cancelled") && errorMessage !== null;
  // 两种底色的完整类名写成映射，避免拼接类名被 Tailwind 的静态扫描漏掉
  const failureBackgroundClass =
    summary.status === "failed" ? "bg-status-failed-soft" : "bg-raised";

  return (
    <header className="block" data-detail-header>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        data-detail-back
        onClick={onClose}
        className="mb-2 h-7 rounded-sm px-2 text-12 text-fg-2 lg:hidden"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        返回
      </Button>
      <div className="flex items-start justify-between gap-3">
        <h1
          data-detail-title
          title={summary.title}
          className="line-clamp-2 min-w-0 flex-1 text-16 font-semibold wrap-anywhere text-fg-1"
        >
          {summary.title}
        </h1>
        <div className="flex shrink-0 items-center gap-1 whitespace-nowrap">
          {/* CopyButton 不接受额外的 DOM 属性，data-copy-id 挂在外面这层；
              这一层只包 CopyButton，所以它的文字就是编号本身（交互检查读它）。
              text-fg-3 也是靠继承生效：CopyButton 的文字没有自己的颜色类。 */}
          <span data-copy-id className="text-fg-3">
            <CopyButton text={summary.id} label="复制编号" showText />
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="关闭详情"
            data-detail-close
            onClick={onClose}
            className="hidden text-fg-3 lg:inline-flex"
          >
            <X aria-hidden />
          </Button>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <StatusBadge
          size="md"
          status={summary.status}
          retry={summary.retry}
          queuePosition={summary.queuePosition}
        />
        <span className={`font-mono text-13 tabular-nums ${durationClass}`}>
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
          className={`mt-2.5 rounded-md px-3 py-2 text-12 ${failureBackgroundClass}`}
        >
          {summary.failReason !== null && (
            <span className="font-semibold text-fg-1">
              {FAIL_REASON_LABELS[summary.failReason]}：
            </span>
          )}
          <span className="line-clamp-4 whitespace-pre-wrap wrap-anywhere text-fg-2">
            {errorMessage}
          </span>
        </div>
      )}
    </header>
  );
}
