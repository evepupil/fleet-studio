import { ChevronRight, Kanban, List, ListChecks } from "lucide-react";
import { useEffect } from "react";
import { ColorDot } from "@/components/ColorDot";
import { ViewBar } from "@/components/ViewBar";
import { ViewTabs } from "@/components/ViewTabs";
import { TaskBoard } from "@/features/board/TaskBoard";
import { DisplayMenu } from "@/features/tasks/DisplayMenu";
import { TaskFilterBar } from "@/features/tasks/TaskFilterBar";
import { TaskList } from "@/features/tasks/TaskList";
import { projectColorVar } from "@/lib/colors";
import type { TaskView } from "@/lib/taskFilters";
import { useTaskFilterStore } from "@/state/taskFilterStore";
import { useProjectLookup } from "@/state/useProjectLookup";
import { useViewStore } from "@/state/viewStore";

function TasksPage({ view }: { view: TaskView }) {
  const setLastTasksView = useViewStore((state) => state.setLastTasksView);
  const projectKey = useTaskFilterStore((state) => state.project);
  const lookup = useProjectLookup();

  useEffect(() => {
    setLastTasksView(view);
  }, [view, setLastTasksView]);

  const project = projectKey === undefined ? undefined : lookup(projectKey);
  const title =
    project === undefined ? (
      "任务"
    ) : (
      <>
        <span className="text-fg-2">任务</span>
        <ChevronRight aria-hidden="true" className="size-3.5 text-fg-3" />
        {project.colorIndex === undefined ? null : (
          <ColorDot colorVar={projectColorVar(project.colorIndex)} size={8} />
        )}
        <span data-view-project className="truncate">
          {project.name}
        </span>
      </>
    );

  return (
    <>
      <ViewBar
        icon={ListChecks}
        documentTitle="任务"
        title={title}
        right={<DisplayMenu view={view} />}
      >
        <ViewTabs
          ariaLabel="视图"
          items={[
            { key: "board", label: "看板", to: "/tasks", icon: Kanban, end: true },
            { key: "list", label: "列表", to: "/tasks/list", icon: List, end: true },
          ]}
        />
      </ViewBar>
      <TaskFilterBar view={view} />
      <div
        data-page-body
        data-page={view === "board" ? "board" : "list"}
        className="min-h-0 flex-1"
      >
        {view === "board" ? <TaskBoard /> : <TaskList />}
      </div>
    </>
  );
}

export { TasksPage };
