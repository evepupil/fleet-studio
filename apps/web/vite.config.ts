import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // 资源用相对路径：服务在根路径托管时照常解析，验收截图时也能直接用 file:// 打开构建产物
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@fleet/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
