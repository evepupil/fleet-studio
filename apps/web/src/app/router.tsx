import { createHashRouter, Navigate, useParams } from "react-router";
import { AppShell } from "@/app/AppShell";
import { OverviewPage } from "@/pages/OverviewPage";
import { SlotsPage } from "@/pages/SlotsPage";
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
        { index: true, element: <Navigate to="/overview" replace /> },
        { path: "overview", element: <OverviewPage /> },
        { path: "slots", element: <SlotsPage /> },
        { path: "tasks", element: <TasksPage /> },
        { path: "tasks/:id", element: <TasksPage /> },
        { path: "w/:id", element: <LegacyWorkerRedirect /> },
        { path: "*", element: <Navigate to="/overview" replace /> },
      ],
    },
  ]);
}

export { createAppRouter };
