import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { pickDataSource } from "@/api/pickSource";
import { DataSourceContext, queryClient } from "@/api/queries";
import { createAppRouter } from "@/app/router";
import { Toaster } from "@/components/ui/sonner";
import { initNow } from "@/state/nowStore";
import { initWorkerStore } from "@/state/workerStore";
import "@/styles/globals.css";

const dataSource = pickDataSource(window.location.search);
// 渲染前先把数据源交给这两个仓库：React 先跑子组件的副作用，直接打开详情链接时，
// 详情页会比外壳更早去订阅；那时仓库还没有数据源，详情会一直停在加载中。
initNow(dataSource);
initWorkerStore(dataSource);
const router = createAppRouter();
const container = document.getElementById("root");

if (container) {
  createRoot(container).render(
    <QueryClientProvider client={queryClient}>
      <DataSourceContext.Provider value={dataSource}>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" />
      </DataSourceContext.Provider>
    </QueryClientProvider>,
  );
}
