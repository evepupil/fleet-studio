import type { WorkerDetail } from "@fleet/core";
import { WorkerDisclosure } from "./WorkerDisclosure";

export interface TaskSectionProps {
  detail: WorkerDetail;
}

/**
 * 任务文字里第一个「有信息量」的非空行，给折叠标题旁的摘要用：跳过 Markdown 标题行（# 开头），
 * 因为任务书几乎都以「## 目标」这类标题开头，直接取第一个非空行摘要会全是标题符号。
 * 所有非空行都是标题时退而求其次，取第一行并去掉开头的 # 和空格；全文空白就留空。
 */
function firstNonEmptyLine(text: string): string {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const firstNonHeading = lines.find((line) => !line.startsWith("#"));
  if (firstNonHeading !== undefined) {
    return firstNonHeading;
  }
  const first = lines[0];
  return first === undefined ? "" : first.replace(/^#+\s*/, "");
}

/** 任务：只展示第 1 次运行收到的完整任务；之后运行的追加指令画在时间线的运行分隔处（R8），这里不重复。 */
export function TaskSection({ detail }: TaskSectionProps) {
  const firstRun = detail.runs[0];
  if (firstRun === undefined) {
    return null;
  }
  return (
    <section className="mt-4" data-task>
      <WorkerDisclosure
        id="task"
        title="任务"
        meta={firstNonEmptyLine(firstRun.prompt)}
        defaultOpen={detail.summary.status === "queued"}
      >
        <div className="mt-1 max-h-[360px] overflow-y-auto rounded-md border border-line bg-raised px-3.5 py-3 text-13 wrap-anywhere whitespace-pre-wrap text-fg-1">
          {firstRun.prompt}
        </div>
      </WorkerDisclosure>
    </section>
  );
}
