import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import customHooksPlugin from "./eslint/custom-hooks-plugin.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Ignore build output, dependencies, and non-source files
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "coverage/**",
      "test-results/**",
      "docs/**",
      "__mocks__/**",
      "types/**",
      "scripts/**",
      "public/**",
      "site/**",
      "eslint/**",
      "*.config.js",
      "*.config.mjs",
      "jest.setup.js",
      "sentry.*.config.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    plugins: {
      "custom-hooks": customHooksPlugin,
    },
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
      ],
      "custom-hooks/require-memoized-function-props": [
        "error",
        {
          "hooks": [
            {
              "name": "useGameState",
              "functionProps": ["saveStateToHistory"]
            },
            {
              "name": "useTacticalBoard",
              "functionProps": ["saveStateToHistory"]
            }
          ]
        }
      ]
    },
  },
  {
    // Allow console usage and localStorage in specific utility files
    files: [
      "src/utils/logger.ts",           // Logger implementation itself
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
      "no-restricted-globals": "off",
      "custom-hooks/require-memoized-function-props": "off"
    }
  },
  {
    // Test files: relax rules that are impractical in test code
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "tests/**/*.ts",
      "tests/**/*.tsx",
      "tests/**/*.js"
    ],
    rules: {
      "no-console": "off",                              // Tests often need console for debugging
      "no-restricted-imports": "off",                   // Tests may need to import localStorage utils
      "no-restricted-globals": "off",                   // Tests may mock localStorage
      "@typescript-eslint/no-explicit-any": "off",      // Test mocks often use any
      "@typescript-eslint/no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",                      // Allow _unused pattern
        "varsIgnorePattern": "^_"
      }],
      "@typescript-eslint/ban-ts-comment": "off",       // Tests may need @ts-ignore for mocks
      "@typescript-eslint/no-require-imports": "off",   // Some test utils use require
      "custom-hooks/require-memoized-function-props": "off"
    }
  }
];

export default eslintConfig;
