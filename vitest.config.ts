import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirror the `@/*` path alias from tsconfig.json.
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: [
      "lib/**/*.test.ts",
      "app/**/*.test.ts",
      "components/**/*.test.tsx",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary", "lcov"],
      include: ["lib/**", "app/**", "components/**"],
      exclude: [
        "**/*.test.ts",
        "**/*.spec.ts",
        "**/*.d.ts",
        "e2e/**",
        "lib/supabase/database.types.ts",
      ],
    },
  },
});
