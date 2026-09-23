import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
  },
  resolve: {
    alias: {
      "@fleet/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@fleet/testkit": fileURLToPath(new URL("./packages/testkit/src/index.ts", import.meta.url)),
    },
  },
});
