import type { ProjectView, WorkerSummary } from "@fleet/core";
import { ChevronRight, CircleDot, CircleX, Clock } from "lucide-react";
import { MonoPath } from "../../components/MonoPath";
import { ProjectDot } from "../../components/ProjectDot";
import { Tip } from "../../components/Tip";
import styles from "./ProjectGroup.module.css";
import { WorkerRow } from "./WorkerRow";

const { root, header, chevron, name: nameClass, countsRow, countItem, countValue } = styles;

export interface ProjectGroupProps {
  project: ProjectView;
  workers: readonly WorkerSummary[];
  open: boolean;
  selectedId: string | null;
  onToggle(): void;
}

/** project.key 里的路径分隔符、冒号等字符对 id 属性不安全，换成短横线拼出一个稳定的 id。 */
function bodyIdFor(key: string): string {
  return `project-body-${key.replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

/**
 * R5 项目组：组头是可点的整行（名字、色点、三个状态计数），组体是苦工行列表。
 * 展开状态和是否渲染组体完全由父级 ProjectList 算好传进来，这里只管画。
 */
export function ProjectGroup({ project, workers, open, selectedId, onToggle }: ProjectGroupProps) {
  const bodyId = bodyIdFor(project.key);

  return (
    <section className={root} data-project={project.key}>
      <button
        type="button"
        className={header}
        data-project-toggle
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <ChevronRight
          aria-hidden
          size={12}
          className={chevron}
          data-open={open ? "true" : "false"}
        />
        <ProjectDot colorIndex={project.colorIndex} />
        <Tip content={<MonoPath path={project.path} max={56} />}>
          <span className={nameClass}>{project.name}</span>
        </Tip>
        <span className={countsRow}>
          {project.counts.running > 0 && (
            <span className={countItem} role="img" aria-label={`工作中 ${project.counts.running}`}>
              <CircleDot aria-hidden size={12} style={{ color: "var(--st-running)" }} />
              <span className={countValue}>{project.counts.running}</span>
            </span>
          )}
          {project.counts.queued > 0 && (
            <span className={countItem} role="img" aria-label={`排队中 ${project.counts.queued}`}>
              <Clock aria-hidden size={12} style={{ color: "var(--st-queued)" }} />
              <span className={countValue}>{project.counts.queued}</span>
            </span>
          )}
          {project.counts.failed > 0 && (
            <span className={countItem} role="img" aria-label={`失败 ${project.counts.failed}`}>
              <CircleX aria-hidden size={12} style={{ color: "var(--st-failed)" }} />
              <span className={countValue}>{project.counts.failed}</span>
            </span>
          )}
        </span>
      </button>
      {open && (
        // biome-ignore lint/a11y/noRedundantRoles: base.css 清空 ul 的 list-style 后 Safari 会丢失隐式 list 角色，页面规格要求显式补回 role="list"
        <ul role="list" id={bodyId}>
          {workers.map((worker) => (
            <WorkerRow key={worker.id} worker={worker} selected={worker.id === selectedId} />
          ))}
        </ul>
      )}
    </section>
  );
}
