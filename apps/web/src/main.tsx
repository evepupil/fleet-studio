import { QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { pickDataSource } from "@/api/pickSource";
import { DataSourceContext, queryClient } from "@/api/queries";
import { createAppRouter } from "@/app/router";
import { Toaster } from "@/components/ui/sonner";
import "@/styles/globals.css";

const dataSource = pickDataSource(window.location.search);
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
