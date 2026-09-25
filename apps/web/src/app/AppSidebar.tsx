import { Layers, LayoutDashboard, ListChecks, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useSidebarStore } from "@/state/sidebarStore";
import { useSnapshotStore } from "@/state/snapshotStore";

const NAV_ITEMS = [
  { label: "总览", path: "/overview", key: "overview", icon: LayoutDashboard },
  { label: "槽位", path: "/slots", key: "slots", icon: Layers },
  { label: "任务", path: "/tasks", key: "tasks", icon: ListChecks },
] as const;

export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return narrow;
}

function AppSidebar() {
  const storedCollapsed = useSidebarStore((state) => state.collapsed);
  const setCollapsed = useSidebarStore((state) => state.setCollapsed);
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const narrow = useNarrowViewport();
  const collapsed = narrow || storedCollapsed;
  const runningCount = (snapshot?.live.running ?? 0) + (snapshot?.live.queued ?? 0);

  return (
    <Sidebar
      collapsible="icon"
      data-nav
      data-collapsed={collapsed ? "true" : "false"}
      className="border-r border-line bg-panel"
    >
      <SidebarHeader className="h-14 flex-row items-center gap-2 border-b border-line px-4 py-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand text-12 font-semibold text-on-brand">
          F
        </span>
        <div className="flex min-w-0 items-baseline gap-2 group-data-[collapsible=icon]:hidden">
          <span className="truncate text-14 font-semibold text-fg-1">fleet studio</span>
          <span className="shrink-0 font-mono text-11 text-fg-3">v0.2</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu className="gap-1 px-3 py-3">
          {NAV_ITEMS.map(({ label, path, key, icon: Icon }) => (
            <SidebarMenuItem key={key}>
              <SidebarMenuButton
                asChild
                tooltip={label}
                size="lg"
                className="h-10 gap-3 rounded-md px-3 [&>svg]:size-[18px] group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:px-0!"
              >
                <NavLink
                  to={path}
                  end={key !== "tasks"}
                  data-nav-item={key}
                  className="group flex h-10 w-full min-w-0 items-center gap-3 rounded-md px-3 text-13 text-fg-2 hover:bg-hover aria-[current=page]:bg-selected aria-[current=page]:text-brand group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                >
                  <Icon
                    aria-hidden="true"
                    className="size-[18px] shrink-0 text-fg-3 group-aria-[current=page]:text-brand"
                  />
                  <span className="truncate group-data-[collapsible=icon]:hidden">{label}</span>
                  {key === "tasks" && runningCount > 0 ? (
                    <span
                      data-nav-count
                      className="ml-auto rounded-sm bg-hover px-1.5 font-mono text-11 text-fg-2 group-data-[collapsible=icon]:hidden"
                    >
                      {runningCount}
                    </span>
                  ) : null}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="px-3 pb-3 pt-0 group-data-[collapsible=icon]:items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-nav-toggle
          aria-label={collapsed ? "展开菜单" : "收起菜单"}
          title={collapsed ? "展开菜单" : "收起菜单"}
          onClick={() => setCollapsed(!storedCollapsed)}
          className={`size-8 ${narrow ? "hidden lg:inline-flex" : ""}`}
        >
          {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

export { AppSidebar };
