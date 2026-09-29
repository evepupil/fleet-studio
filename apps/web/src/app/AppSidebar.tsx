import { Layers, LayoutDashboard, ListChecks } from "lucide-react";
import { Link, useLocation } from "react-router";
import { ColorDot } from "@/components/ColorDot";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { projectColorVar } from "@/lib/colors";
import { useSidebarStore } from "@/state/sidebarStore";
import { useSnapshotStore } from "@/state/snapshotStore";
import { useTaskFilterStore } from "@/state/taskFilterStore";
import { tasksPath, useViewStore } from "@/state/viewStore";

const NAV_ITEM_CLASS =
  "group flex h-7 items-center gap-2 rounded-md px-2 text-13 font-medium text-fg-2 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-hover hover:text-fg-1 aria-[current=page]:bg-selected aria-[current=page]:text-fg-1";

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const lastTasksView = useViewStore((state) => state.lastTasksView);
  const projectFilter = useTaskFilterStore((state) => state.project);
  const navCount = snapshot ? snapshot.live.running + snapshot.live.queued : 0;
  const taskPath = pathname.startsWith("/tasks");
  const taskDetail = taskPath && pathname !== "/tasks" && pathname !== "/tasks/list";
  const projectPath = pathname === "/tasks" || pathname === "/tasks/list";
  const projects = snapshot?.projects ?? [];

  return (
    <>
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <span
          aria-hidden="true"
          className="grid size-5 shrink-0 place-items-center rounded-md bg-team text-12 font-medium text-on-brand"
        >
          F
        </span>
        <span className="truncate text-13 font-medium text-fg-1">fleet studio</span>
        <span className="shrink-0 font-mono text-12 text-fg-3">v0.3</span>
      </div>
      <nav aria-label="主菜单" className="flex flex-col gap-px px-2">
        <Link
          to={tasksPath(lastTasksView)}
          data-nav-item="tasks"
          aria-current={
            taskPath && (taskDetail || projectFilter === undefined) ? "page" : undefined
          }
          onClick={() => {
            useTaskFilterStore.getState().set({ project: undefined });
            onNavigate?.();
          }}
          className={NAV_ITEM_CLASS}
        >
          <ListChecks
            aria-hidden="true"
            className="size-4 shrink-0 text-fg-3 group-aria-[current=page]:text-fg-1"
          />
          <span className="truncate">任务</span>
          {navCount > 0 ? (
            <span
              data-nav-count
              className="ml-auto font-mono text-12 text-fg-3 group-aria-[current=page]:text-fg-2"
            >
              {navCount}
            </span>
          ) : null}
        </Link>
        <Link
          to="/slots"
          data-nav-item="slots"
          aria-current={pathname.startsWith("/slots") ? "page" : undefined}
          onClick={onNavigate}
          className={NAV_ITEM_CLASS}
        >
          <Layers
            aria-hidden="true"
            className="size-4 shrink-0 text-fg-3 group-aria-[current=page]:text-fg-1"
          />
          <span className="truncate">槽位</span>
        </Link>
        <Link
          to="/overview"
          data-nav-item="overview"
          aria-current={pathname.startsWith("/overview") ? "page" : undefined}
          onClick={onNavigate}
          className={NAV_ITEM_CLASS}
        >
          <LayoutDashboard
            aria-hidden="true"
            className="size-4 shrink-0 text-fg-3 group-aria-[current=page]:text-fg-1"
          />
          <span className="truncate">总览</span>
        </Link>
      </nav>
      {projects.length > 0 ? (
        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <div className="flex h-7 shrink-0 items-center px-4 text-12 font-medium text-fg-3">
            项目
          </div>
          <nav aria-label="项目" className="flex min-h-0 flex-col gap-px overflow-y-auto px-2">
            {projects.map((project) => {
              const count = project.counts.running + project.counts.queued;
              const active = projectPath && projectFilter === project.key;
              return (
                <Link
                  key={project.key}
                  data-nav-project={project.key}
                  to={tasksPath(lastTasksView)}
                  title={project.name}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    useTaskFilterStore.getState().reset();
                    useTaskFilterStore.getState().set({ project: project.key });
                    onNavigate?.();
                  }}
                  className={NAV_ITEM_CLASS}
                >
                  <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center">
                    <ColorDot colorVar={projectColorVar(project.colorIndex)} size={8} />
                  </span>
                  <span className="truncate">{project.name}</span>
                  {count > 0 ? (
                    <span
                      data-nav-project-count
                      className="ml-auto font-mono text-12 text-fg-3 group-aria-[current=page]:text-fg-2"
                    >
                      {count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </>
  );
}

function AppSidebar() {
  const wide = useMediaQuery("(min-width: 1024px)");
  const open = useSidebarStore((state) => state.open);
  const drawerOpen = useSidebarStore((state) => state.drawerOpen);
  const setDrawerOpen = useSidebarStore((state) => state.setDrawerOpen);

  if (wide) {
    return (
      <aside
        data-nav
        data-state={open ? "open" : "closed"}
        className={
          open ? "flex w-[var(--sidebar-w)] shrink-0 flex-col overflow-hidden pb-2" : "hidden"
        }
      >
        <SidebarBody />
      </aside>
    );
  }

  return (
    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
      <SheetContent
        side="left"
        data-nav-drawer
        aria-describedby={undefined}
        className="flex flex-col pb-2"
      >
        <SheetTitle className="sr-only">菜单</SheetTitle>
        <SidebarBody onNavigate={() => setDrawerOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

export { AppSidebar };
