import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "react-hooks/exhaustive-deps": "error",
      // Prevent direct console usage - use logger utility instead
      "no-console": "error",
    },
  },
  {
    // Allow console usage in specific files where it's appropriate
    files: [
      "src/utils/logger.ts",           // Logger implementation itself
      "**/*.test.ts",                  // Test files
      "**/*.test.tsx",                 // Test files
      "tests/**/*",                    // Test directory
      "scripts/**/*",                  // Build scripts
      "tests/utils/console-control.js", // Console control utility
      "src/setupTests.mjs"            // Test setup file
    ],
    rules: {
      "no-console": "off"
    }
  }
];

export default eslintConfig;
