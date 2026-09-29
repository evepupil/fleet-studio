import { createHashRouter, Navigate, useParams } from "react-router";
import { AppShell } from "@/app/AppShell";
import { OverviewPage } from "@/pages/OverviewPage";
import { SlotsPage } from "@/pages/SlotsPage";
import { TaskDetailPage } from "@/pages/TaskDetailPage";
import { TasksPage } from "@/pages/TasksPage";

function LegacyWorkerRedirect() {
  const { id } = useParams();
  return <Navigate to={`/tasks/${id ?? ""}`} replace />;
}

function createAppRouter() {
  return createHashRouter([
    {
      path: "/",
      element: <AppShell />,
      children: [
        { index: true, element: <Navigate to="/tasks" replace /> },
        { path: "tasks", element: <TasksPage view="board" /> },
        { path: "tasks/list", element: <TasksPage view="list" /> },
        { path: "tasks/:id", element: <TaskDetailPage /> },
        { path: "slots", element: <SlotsPage /> },
        { path: "overview", element: <OverviewPage /> },
        { path: "w/:id", element: <LegacyWorkerRedirect /> },
        { path: "*", element: <Navigate to="/tasks" replace /> },
      ],
    },
  ]);
}

export { createAppRouter };
