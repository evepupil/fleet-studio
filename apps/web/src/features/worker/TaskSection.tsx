import type { WorkerDetail } from "@fleet/core";
import { Disclosure } from "../../components/Disclosure";
import styles from "./TaskSection.module.css";

const { root, box } = styles;

export interface TaskSectionProps {
  detail: WorkerDetail;
}

/** 任务文字里第一个非空行，给折叠标题旁的摘要用；找不到非空行就留空。 */
function firstNonEmptyLine(text: string): string {
  const line = text.split(/\r\n|\r|\n/).find((candidate) => candidate.trim().length > 0);
  return line?.trim() ?? "";
}

/** 任务：只展示第 1 次运行收到的完整任务；之后运行的追加指令画在时间线的运行分隔处（R8），这里不重复。 */
export function TaskSection({ detail }: TaskSectionProps) {
  const firstRun = detail.runs[0];
  if (firstRun === undefined) {
    return null;
  }
  return (
    <section className={root} data-task>
      <Disclosure
        id="task"
        title="任务"
        meta={firstNonEmptyLine(firstRun.prompt)}
        defaultOpen={detail.summary.status === "queued"}
      >
        <div className={box}>{firstRun.prompt}</div>
      </Disclosure>
    </section>
  );
}
