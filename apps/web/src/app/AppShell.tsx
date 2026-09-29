import { useEffect } from "react";
import { Outlet } from "react-router";
import { useDataSource, useLiveInvalidation } from "@/api/queries";
import { AppSidebar } from "@/app/AppSidebar";
import { ConnectionGate } from "@/app/ConnectionGate";
import { ShellBanners } from "@/app/ShellBanners";
import { SearchDialog } from "@/app/search/SearchDialog";
import { WindowBar } from "@/app/WindowBar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { initNow } from "@/state/nowStore";
import { useSearchStore } from "@/state/searchStore";
import { useSidebarStore } from "@/state/sidebarStore";
import { setSnapshotReconnect, useSnapshotStore } from "@/state/snapshotStore";
import { initWorkerStore } from "@/state/workerStore";

function AppShell() {
  const dataSource = useDataSource();
  const connection = useSnapshotStore((state) => state.connection);
  const everOpened = useSnapshotStore((state) => state.everOpened);
  const setSnapshot = useSnapshotStore((state) => state.setSnapshot);
  const setConnection = useSnapshotStore((state) => state.setConnection);
  const wide = useMediaQuery("(min-width: 1024px)");
  const sidebarOpen = useSidebarStore((state) => state.open);
  const setDrawerOpen = useSidebarStore((state) => state.setDrawerOpen);
  const sidebarDocked = wide && sidebarOpen;
  const offline = connection === "lost" && everOpened;

  useLiveInvalidation();

  useEffect(() => {
    initNow(dataSource);
    initWorkerStore(dataSource);
  }, [dataSource]);

  useEffect(() => {
    let unsubscribe: () => void = () => undefined;
    const subscribe = () => dataSource.subscribeSnapshot(setSnapshot, setConnection);
    unsubscribe = subscribe();
    setSnapshotReconnect(() => {
      unsubscribe();
      unsubscribe = subscribe();
    });
    return () => {
      setSnapshotReconnect(null);
      unsubscribe();
    };
  }, [dataSource, setConnection, setSnapshot]);

  useEffect(() => {
    if (wide) setDrawerOpen(false);
  }, [wide, setDrawerOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        useSearchStore.getState().toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div data-app className="flex h-svh flex-col bg-window text-fg-1">
        <WindowBar />
        <div className="flex min-h-0 flex-1">
          <AppSidebar />
          <main
            data-workspace
            data-offline={offline ? "true" : "false"}
            className={`mb-2 mr-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-panel ${sidebarDocked ? "" : "ml-2"} max-md:mb-1 max-md:mr-1 ${sidebarDocked ? "" : "max-md:ml-1"}`}
          >
            <ShellBanners />
            <ConnectionGate>
              <Outlet />
            </ConnectionGate>
          </main>
        </div>
        <SearchDialog />
      </div>
    </TooltipProvider>
  );
}

export { AppShell };
