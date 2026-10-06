import { defineConfig } from "vitest/config";

// Tests only need module resolution (the `@/` alias and JSON imports), not the
// TanStack Start / Nitro plugins from vite.config.ts.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
