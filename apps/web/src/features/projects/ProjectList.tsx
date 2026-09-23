import type { ProjectView } from "@fleet/core";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { useSelectionStore } from "../../state/selectionStore";
import { selectProjectGroups } from "../../state/selectors";
import { useSnapshotStore } from "../../state/snapshotStore";
import { ProjectGroup } from "./ProjectGroup";
import styles from "./ProjectList.module.css";

const { root, groupList, skeletonList } = styles;

const SKELETON_KEYS = ["sk-1", "sk-2", "sk-3", "sk-4", "sk-5", "sk-6"] as const;

/** 没有展开记录时的默认展开规则：项目里有排队中或工作中的苦工就展开，否则收起。 */
function defaultOpen(project: ProjectView): boolean {
  return project.counts.running > 0 || project.counts.queued > 0;
}

/**
 * R5 项目与苦工列表：按项目分组渲染苦工行，展开、排序、筛选全部取 selectors 现成的结果，
 * 不在这里重写规则。另外负责两处跨区域协调：选中苦工后自动展开所在组并滚动可见；
 * 列表内上下方向键跨组移动焦点。
 */
export function ProjectList() {
  const containerRef = useRef<HTMLElement | null>(null);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  // 只订阅「快照是否已到」这一个布尔值：它这辈子最多从 false 变成 true 一次，之后快照
  // 再怎么刷新这个值都不会再变，所以能放进下面 effect 的依赖里、只为了补一次冷启动。
  const hasSnapshot = useSnapshotStore((state) => state.snapshot !== null);
  const listFilter = useSelectionStore((state) => state.listFilter);
  const expanded = useSelectionStore((state) => state.expanded);
  const toggleProject = useSelectionStore((state) => state.toggleProject);
  const selectedId = useSelectionStore((state) => state.selectedId);

  // 选中联动（容量条点格子只会 select(id)，不会展开组）：selectedId 变化时，若所在组按当前
  // 规则算出来是收起的就展开它，再把那一行滚到可见。这里用 getState() 直接读最新状态，
  // 让这个 effect 不会因为自己调用 toggleProject 或者 snapshot 定期刷新而反复重跑。
  // 依赖额外加了 hasSnapshot：覆盖「直接打开 #/w/<编号> 链接、页面挂载时快照还没到」的冷启动——
  // selectedId 在挂载时就已经定了不会再变，靠它自己等不到快照到达后再补一次；hasSnapshot
  // 从 false 翻到 true 只会发生一次，之后不会再因为快照刷新把用户拉回选中行。
  // biome-ignore lint/correctness/useExhaustiveDependencies: hasSnapshot 故意不在回调里直接读（回调里用 getState() 读最新快照），只用来在它从 false 变 true 的那一刻多触发一次这个 effect
  useEffect(() => {
    if (selectedId === null) {
      return;
    }
    const currentSnapshot = useSnapshotStore.getState().snapshot;
    if (currentSnapshot === null) {
      return;
    }
    const worker = currentSnapshot.workers.find((candidate) => candidate.id === selectedId);
    if (worker === undefined) {
      return;
    }
    const selection = useSelectionStore.getState();
    const stillVisible =
      selection.listFilter !== "active" ||
      worker.status === "queued" ||
      worker.status === "running";
    if (!stillVisible) {
      // 筛选为「进行中」而选中的苦工已结束：这一行本来就不会渲染，什么都不做。
      return;
    }
    const project = currentSnapshot.projects.find(
      (candidate) => candidate.key === worker.projectKey,
    );
    const isOpen =
      selection.expanded[worker.projectKey] ?? (project !== undefined && defaultOpen(project));
    if (!isOpen) {
      selection.toggleProject(worker.projectKey);
    }
    requestAnimationFrame(() => {
      const rows = containerRef.current?.querySelectorAll<HTMLButtonElement>("[data-worker-row]");
      rows?.forEach((rowEl) => {
        const { workerRow } = rowEl.dataset;
        if (workerRow === selectedId) {
          rowEl.scrollIntoView({ block: "nearest" });
        }
      });
    });
  }, [selectedId, hasSnapshot]);

  /** 上下方向键在当前渲染出来的苦工行之间移动焦点，天然跨组（收起的组不渲染组体）。 */
  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const active = document.activeElement;
    if (!(active instanceof HTMLButtonElement)) {
      return;
    }
    const rows = Array.from(container.querySelectorAll<HTMLButtonElement>("[data-worker-row]"));
    // indexOf 要求两边类型一致：先用 instanceof 把 activeElement 从 Element 收窄成
    // HTMLButtonElement，而不是用 as 断言（项目禁止 as 强转）。
    const activeIndex = rows.indexOf(active);
    if (activeIndex === -1) {
      return;
    }
    const nextIndex = event.key === "ArrowDown" ? activeIndex + 1 : activeIndex - 1;
    const next = rows[nextIndex];
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    next.focus();
  }

  let content: ReactNode;
  if (snapshot === null) {
    content = (
      <div className={skeletonList}>
        {SKELETON_KEYS.map((key) => (
          <Skeleton key={key} width="100%" height={44} radius="md" />
        ))}
      </div>
    );
  } else {
    const groups = selectProjectGroups(snapshot, listFilter);
    content =
      groups.length === 0 ? (
        <EmptyState message="没有进行中的苦工" />
      ) : (
        <div className={groupList}>
          {groups.map((group) => {
            const isOpen = expanded[group.project.key] ?? defaultOpen(group.project);
            return (
              <ProjectGroup
                key={group.project.key}
                project={group.project}
                workers={group.workers}
                open={isOpen}
                selectedId={selectedId}
                onToggle={() => toggleProject(group.project.key)}
              />
            );
          })}
        </div>
      );
  }

  return (
    <nav
      className={root}
      data-project-list
      aria-label="项目与苦工"
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {content}
    </nav>
  );
}
