import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Two projects rather than one environment.
 *
 * The money and domain layers are pure and run considerably faster in node, and
 * running them under jsdom would let an accidental dependency on a browser global
 * pass unnoticed. Component tests need a DOM. Vitest 4 removed
 * `environmentMatchGlobs`, so the split is expressed as projects.
 *
 * The boundary is the file extension, which also documents itself: `.test.ts` is
 * logic, `.test.tsx` renders something.
 */
export default defineConfig({
  test: {
    projects: [
      {
        // Resolves the "@/*" alias from tsconfig.json natively, so no plugin is needed.
        resolve: { tsconfigPaths: true },
        test: {
          name: "logic",
          environment: "node",
          include: ["src/**/*.test.ts"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
      {
        plugins: [react()],
        resolve: { tsconfigPaths: true },
        test: {
          name: "components",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          // Adds Testing Library's cleanup on top of the shared setup.
          setupFiles: ["./vitest.setup.ts", "./vitest.setup.dom.ts"],
        },
      },
    ],
  },
});
