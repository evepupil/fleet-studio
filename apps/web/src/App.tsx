import { useEffect, useMemo } from "react";
import styles from "./App.module.css";
import { pickDataSource } from "./api/pickSource";
import { AppBar } from "./components/AppBar";
import { Banner } from "./components/Banner";
import { EmptyState } from "./components/EmptyState";
import { TipProvider } from "./components/Tip";
import { CapacityStrip } from "./features/capacity/CapacityStrip";
import { ListToolbar } from "./features/projects/ListToolbar";
import { ProjectList } from "./features/projects/ProjectList";
import { WorkerDetail } from "./features/worker/WorkerDetail";
import { initNow } from "./state/nowStore";
import { useSelectionStore } from "./state/selectionStore";
import { useSnapshotStore } from "./state/snapshotStore";
import { initWorkerStore, useWorkerStore } from "./state/workerStore";

const { app, body, emptyMain, main, sidebar, detail } = styles;

/**
 * 页面骨架（design/工作区.md 第 0 节）：顶栏、提示条、容量条、左右两栏。
 * 数据源只在这里创建一次，往下全靠 store 传递，区域组件都不直接碰数据源。
 */
export function App() {
  const dataSource = useMemo(() => pickDataSource(location.search), []);

  const snapshot = useSnapshotStore((state) => state.snapshot);
  const connection = useSnapshotStore((state) => state.connection);
  const setSnapshot = useSnapshotStore((state) => state.setSnapshot);
  const setConnection = useSnapshotStore((state) => state.setConnection);

  const selectedId = useSelectionStore((state) => state.selectedId);
  const openWorker = useWorkerStore((state) => state.open);
  const closeWorker = useWorkerStore((state) => state.close);

  useEffect(() => {
    initNow(dataSource);
    initWorkerStore(dataSource);
    return dataSource.subscribeSnapshot(setSnapshot, setConnection);
  }, [dataSource, setSnapshot, setConnection]);

  useEffect(() => {
    if (selectedId === null) {
      closeWorker();
      return;
    }
    openWorker(selectedId);
  }, [selectedId, openWorker, closeWorker]);

  const isOffline = connection === "lost";
  const hasNoWorkers = snapshot !== null && snapshot.workers.length === 0;

  return (
    <TipProvider>
      <div className={app}>
        <AppBar />
        {isOffline && <Banner kind="offline">连接已断开，正在重连</Banner>}
        {snapshot !== null && snapshot.configError !== null && (
          <Banner kind="config">
            配置文件有错，正在使用上一份有效配置：{snapshot.configError}
          </Banner>
        )}
        <div className={body} data-offline={isOffline ? "true" : "false"}>
          <CapacityStrip />
          {hasNoWorkers ? (
            <div className={emptyMain}>
              <EmptyState message="还没有苦工" command='fleet run "任务"' />
            </div>
          ) : (
            <div className={main} data-has-selection={selectedId !== null ? "true" : "false"}>
              <aside className={sidebar}>
                <ListToolbar />
                <ProjectList />
              </aside>
              <main className={detail} id="detail-scroll">
                <WorkerDetail />
              </main>
            </div>
          )}
        </div>
      </div>
    </TipProvider>
  );
}
