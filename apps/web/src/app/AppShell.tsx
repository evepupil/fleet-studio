import type { CSSProperties } from "react";
import { useEffect } from "react";
import { Outlet } from "react-router";
import { useDataSource, useLiveInvalidation } from "@/api/queries";
import { AppSidebar, useNarrowViewport } from "@/app/AppSidebar";
import { ConnectionGate } from "@/app/ConnectionGate";
import { Banner } from "@/components/Banner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { initNow } from "@/state/nowStore";
import { useSidebarStore } from "@/state/sidebarStore";
import { setSnapshotReconnect, useSnapshotStore } from "@/state/snapshotStore";
import { initWorkerStore } from "@/state/workerStore";

function AppShell() {
  const dataSource = useDataSource();
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const connection = useSnapshotStore((state) => state.connection);
  const everOpened = useSnapshotStore((state) => state.everOpened);
  const setSnapshot = useSnapshotStore((state) => state.setSnapshot);
  const setConnection = useSnapshotStore((state) => state.setConnection);
  const storedCollapsed = useSidebarStore((state) => state.collapsed);
  const setCollapsed = useSidebarStore((state) => state.setCollapsed);
  const narrow = useNarrowViewport();
  const collapsed = narrow || storedCollapsed;
  const sidebarStyle: CSSProperties & {
    "--sidebar-width": string;
    "--sidebar-width-icon": string;
  } = {
    "--sidebar-width": "var(--sidebar-w)",
    "--sidebar-width-icon": "var(--sidebar-w-collapsed)",
  };

  useLiveInvalidation();

  useEffect(() => {
    initNow(dataSource);
    // 任务详情的仓库靠它拿到数据源，否则详情会一直停在加载中
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

  const offline = connection === "lost" && everOpened;
  const configError = snapshot?.configError;
  const configMessage =
    configError == null ? null : `配置文件有错，正在使用上一份有效配置：${configError}`;

  return (
    <SidebarProvider
      open={!collapsed}
      onOpenChange={(open) => setCollapsed(!open)}
      style={sidebarStyle}
    >
      <AppSidebar />
      <SidebarInset className="flex h-svh min-w-0 flex-col overflow-hidden bg-page">
        <div className="relative z-[var(--z-banner)] flex shrink-0 flex-col">
          {offline ? <Banner kind="offline">连接已断开，正在重连</Banner> : null}
          {configMessage !== null ? (
            <Banner kind="config" title={configMessage}>
              {configMessage}
            </Banner>
          ) : null}
        </div>
        <ConnectionGate>
          <div
            data-shell-content
            data-offline={offline ? "true" : "false"}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Outlet />
          </div>
        </ConnectionGate>
      </SidebarInset>
    </SidebarProvider>
  );
}

export { AppShell };
