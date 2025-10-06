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
      // Prevent localStorage usage - use storage helper instead (IndexedDB-only policy)
      "no-restricted-imports": [
        "error",
        {
          "paths": [
            {
              "name": "@/utils/localStorage",
              "message": "Direct localStorage usage is not allowed. Use @/utils/storage helper instead for IndexedDB-only compliance."
            }
          ],
          "patterns": [
            {
              "group": ["**/localStorage"],
              "message": "Direct localStorage usage is not allowed. Use @/utils/storage helper instead for IndexedDB-only compliance."
            }
          ]
        }
      ],
      // Prevent direct window.localStorage usage
      "no-restricted-globals": [
        "error",
        {
          "name": "localStorage",
          "message": "Direct localStorage usage is not allowed. Use @/utils/storage helper instead for IndexedDB-only compliance."
        }
      ]
    },
  },
  {
    // Allow console usage and localStorage in specific files where it's appropriate
    files: [
      "src/utils/logger.ts",           // Logger implementation itself
      "**/*.test.ts",                  // Test files
      "**/*.test.tsx",                 // Test files
      "tests/**/*",                    // Test directory
      "scripts/**/*",                  // Build scripts
      "tests/utils/console-control.js", // Console control utility
      "src/setupTests.mjs",           // Test setup file
      "src/utils/migration.ts",        // Migration needs localStorage for one-time enumeration
      "src/utils/localStorage.ts",     // localStorage utility itself (for migration only)
      "src/utils/fullBackup.ts",       // Backup utility needs direct localStorage access
      "src/utils/localStorageAdapter.ts", // Storage adapter implementation
      "src/utils/storageConfigManager.ts", // Config manager bootstrap phase needs direct access
      "src/utils/storageAdapter.ts"    // Base storage adapter types
    ],
    rules: {
      "no-console": "off",
      "no-restricted-imports": "off",
      "no-restricted-globals": "off"
    }
  }
];

export default eslintConfig;
