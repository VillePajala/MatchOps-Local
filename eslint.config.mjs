// Next.js 16 native flat config - no FlatCompat needed
// See: https://github.com/vercel/next.js/issues/85244
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import customHooksPlugin from "./eslint/custom-hooks-plugin.mjs";

const eslintConfig = [
  // Global ignores
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
      "public/**",
      "site/**",
      "eslint/**",
      "*.config.js",
      "*.config.mjs",
      "jest.setup.js",
      "sentry.*.config.ts",
    ],
  },
  // Next.js rules (native flat config)
  ...nextVitals,
  ...nextTypescript,
  // Custom rules
  {
    plugins: {
      "custom-hooks": customHooksPlugin,
    },
    rules: {
      "react-hooks/exhaustive-deps": "error",
      // React 19 eslint-plugin-react-hooks v7 new rules - enforce strictly
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/refs": "error",
      "react-hooks/immutability": "error",
      "react-hooks/globals": "error",
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
      ],
      // Allow underscore-prefixed unused args (common pattern for interface compliance)
      "@typescript-eslint/no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }]
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
      "src/utils/storageAdapter.ts",   // Base storage adapter types
      "src/i18n.ts"                    // Language pref is device-level, loads before DataStore (avoids MATCHOPS-LOCAL-2P)
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
  },
  {
    // Script files: relax rules for Node.js build/utility scripts
    files: [
      "scripts/**/*.js",
      "scripts/**/*.mjs",
      "scripts/**/*.ts"
    ],
    rules: {
      "no-console": "off",                              // Scripts need console for output
      "@typescript-eslint/no-require-imports": "off",   // Scripts may use require
      "custom-hooks/require-memoized-function-props": "off"
    }
  }
];

export default eslintConfig;
