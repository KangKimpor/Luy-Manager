import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Git-ignored scratch and build output. Linting them made `npm run lint`
    // fail locally on files CI never sees.
    ".tmp/**",
    ".cache/**",
    "dist/**",
    "android/**",
  ]),
]);

export default eslintConfig;
