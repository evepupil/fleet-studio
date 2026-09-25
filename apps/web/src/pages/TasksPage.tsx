import { useNavigate, useParams } from "react-router";
import { PageHeader } from "@/app/PageHeader";
import { ActiveFilterChips } from "@/features/tasks/ActiveFilterChips";
import { TaskFilterBar } from "@/features/tasks/TaskFilterBar";
import { TaskTable } from "@/features/tasks/TaskTable";
import { WorkerDetail } from "@/features/worker/WorkerDetail";

function TasksPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <>
      <PageHeader title="任务" />
      <div data-page="tasks" className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <TaskFilterBar />
        <ActiveFilterChips />
        <div
          className={
            id
              ? "grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,36fr)_minmax(0,64fr)]"
              : "flex min-h-0 flex-1 flex-col"
          }
        >
          <TaskTable compact={id !== undefined} selectedId={id ?? null} />
          {id ? <WorkerDetail id={id} onClose={() => navigate("/tasks")} /> : null}
        </div>
      </div>
    </>
  );
}

export { TasksPage };
