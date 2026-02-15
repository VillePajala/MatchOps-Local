# 03. Configuration Files — Copy-Paste Ready with Annotations

> **Audience**: AI agent building the new app
> **Purpose**: Exact configuration files with WHY annotations. Copy these, adapt project-specific values.

---

## How to Use This Document

Each config file is provided verbatim with inline comments explaining WHY each setting exists. When building the new app:

1. Copy the file structure
2. Change project-specific values (app name, paths, etc.)
3. Keep all settings unless a comment says "OPTIONAL" or "ADAPT"
4. Pay special attention to `// CRITICAL:` comments — removing these settings causes hard-to-debug issues

---

## 1. tsconfig.json

```jsonc
{
  "compilerOptions": {
    "target": "ES2017",              // Supports async/await natively — good browser compat
    "lib": ["dom", "dom.iterable", "esnext"],  // DOM APIs + latest JS features
    "allowJs": true,                 // Allows .js files (some configs, scripts)
    "skipLibCheck": true,            // Skip type-checking node_modules — faster builds
    "strict": true,                  // NON-NEGOTIABLE: Catches null errors, implicit any
    "noEmit": true,                  // Next.js handles compilation, not tsc
    "esModuleInterop": true,         // Import CommonJS as ES modules (import x from 'x')
    "module": "esnext",              // Modern module syntax
    "moduleResolution": "bundler",   // Next.js bundler resolution (not node)
    "resolveJsonModule": true,       // Import JSON files as modules
    "isolatedModules": true,         // Required by Next.js for SWC
    "jsx": "react-jsx",              // React 19 JSX transform (no React import needed)
    "incremental": true,             // Faster rebuilds — caches type info
    "plugins": [{ "name": "next" }], // Next.js language service plugin
    "paths": {
      "@/*": ["./src/*"]             // ADAPT: Path alias — @/utils/logger → src/utils/logger
    }
  },
  "include": [
    "next-env.d.ts",                 // Next.js type declarations
    "**/*.ts", "**/*.tsx",           // All TypeScript files
    ".next/types/**/*.ts",           // Next.js generated types
    "types/**/*.ts",                 // Custom type declarations
    ".next/dev/types/**/*.ts"        // Next.js dev types
  ],
  "exclude": [
    "node_modules",
    "site",                          // ADAPT: Marketing site (if separate)
    "supabase/functions"             // Edge Functions use Deno, not Node TS config
  ]
}
```

**Key traps**:
- `"moduleResolution": "bundler"` — NOT `"node"`. Using `"node"` breaks Next.js App Router imports.
- `"jsx": "react-jsx"` — NOT `"react"`. The `react` option requires `import React` in every file.
- `supabase/functions` MUST be excluded — they run on Deno, not Node.js.

---

## 2. package.json (Scripts & Dependencies)

### Scripts

```jsonc
{
  "scripts": {
    // Core development
    "dev": "next dev",
    "build": "node scripts/generate-changelog.mjs && node scripts/generate-manifest.mjs && next build",
    // ADAPT: Pre-build scripts for PWA manifest and changelog generation
    "start": "next start",
    "lint": "eslint .",

    // Testing (see 13-testing-playbook.md for details)
    "test": "jest",                    // Run all tests
    "test:watch": "jest --watch --maxWorkers=1",
    "test:coverage": "jest --coverage --watchAll=false --maxWorkers=1",
    "test:ci": "CI=true jest --ci --maxWorkers=1 --testTimeout=8000 --bail=1",
    // CRITICAL: --bail=1 for CI — fail fast on first error
    "test:debug": "jest --runInBand --no-cache --maxWorkers=1 --detectOpenHandles",

    // Quality checks
    "type-check": "tsc --noEmit",
    "ci": "npm run lint && npm run type-check && npm run test:coverage && npm run build",
    // Full CI pipeline — run before every PR

    // i18n
    "generate:i18n-types": "node scripts/generate-i18n-types.mjs",
    // CRITICAL: Run after changing translation files — generates TypeScript types for keys

    // Bundle analysis
    "build:analyze": "ANALYZE=true npm run build && node scripts/bundle-analysis.mjs"
  }
}
```

### Dependencies (with WHY)

```jsonc
{
  "dependencies": {
    // --- UI Framework ---
    "@headlessui/react": "^2.2.4",       // Accessible UI primitives (Dialog, Listbox, etc.)
    "next": "^16.1.6",                   // App framework
    "react": "^19.2.1",                  // UI library
    "react-dom": "^19.2.1",             // React DOM renderer
    "react-icons": "^5.5.0",            // Icon library (tree-shakeable)
    "recharts": "^2.15.4",              // Charts (attendance stats, etc.)
    "tinycolor2": "^1.6.0",             // Color manipulation (player disc colors)

    // --- Data Layer ---
    "@supabase/supabase-js": "^2.49.4", // Supabase client (auth, database, functions)
    "@tanstack/react-query": "^5.90.11", // Async state management + caching
    "idb": "^8.0.3",                    // IndexedDB promise wrapper
    "zod": "^3.25.76",                  // Schema validation (settings, imports)

    // --- Utilities ---
    "date-fns": "^4.1.0",               // Date formatting/manipulation
    "i18next": "^25.7.1",               // Internationalization framework
    "react-i18next": "^16.3.5",         // React bindings for i18next

    // --- Monitoring ---
    "@sentry/nextjs": "^10.28.0",       // Error reporting + performance monitoring

    // --- Export ---
    "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
    // GOTCHA: SheetJS removed npm registry access. CDN tarball is official distribution.
    // OPTIONAL: Only needed if your app exports to Excel
  },

  "devDependencies": {
    // --- Testing ---
    "jest": "^30.2.0",                   // Test runner
    "jest-environment-jsdom": "^30.2.0", // Browser environment for tests
    "@testing-library/react": "^16.3.0", // React component testing
    "@testing-library/jest-dom": "^6.6.3", // DOM matchers (toBeInTheDocument, etc.)
    "@testing-library/user-event": "^14.6.1", // User interaction simulation
    "fake-indexeddb": "^6.2.2",          // CRITICAL: Mock IndexedDB for tests
    "jest-canvas-mock": "^2.5.2",        // Mock canvas (for field rendering tests)
    "jest-axe": "^10.0.0",              // Accessibility testing
    "jest-html-reporters": "^3.1.7",     // HTML test reports
    "jest-junit": "^16.0.0",            // JUnit XML reports (CI integration)
    "@axe-core/react": "^4.10.2",       // Runtime a11y checking
    "@types/jest-axe": "^3.5.9",

    // --- Build ---
    "tailwindcss": "^4",
    "@tailwindcss/postcss": "^4",
    "typescript": "^5",
    "eslint": "^9",
    "eslint-config-next": "^16.0.10",
    "sharp": "^0.34.5",                 // Image optimization (Next.js)
    "@next/bundle-analyzer": "^16.0.7",

    // --- E2E (optional) ---
    "@playwright/test": "^1.55.0",

    // --- Types ---
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/tinycolor2": "^1.4.6"
  }
}
```

**Key traps**:
- `fake-indexeddb` is REQUIRED for testing any DataStore code. Without it, all storage tests fail.
- `jest-canvas-mock` is REQUIRED if you test any component that renders `<canvas>`.
- `xlsx` uses CDN tarball URL, not a normal npm package name.
- `jest` and `jest-environment-jsdom` versions MUST match (both 30.x or both 29.x).

---

## 3. jest.config.js

```javascript
import nextJest from 'next/jest.js'; // .js extension required for ESM

const createJestConfig = nextJest({
  dir: './',  // Next.js root — loads next.config and .env for test environment
});

/** @type {import('jest').Config} */
const customJestConfig = {
  setupFilesAfterEnv: [
    '<rootDir>/src/setupTests.mjs',          // Global mocks, console suppression
    '<rootDir>/tests/utils/test-cleanup.js',  // React cleanup between tests
    '<rootDir>/tests/utils/console-control.js', // Console error/warn fail triggers
    '<rootDir>/tests/utils/flaky-test-tracker.js' // OPTIONAL: Tracks flaky tests
  ],

  testEnvironment: 'jest-environment-jsdom',  // Browser-like environment

  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',  // Match tsconfig path alias
  },

  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '<rootDir>/tests/e2e/',  // Don't run Playwright tests with Jest
  ],

  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}'
  ],

  coverageThreshold: {
    global: {
      branches: 45,     // ADAPT: Start lower for new project, increase over time
      functions: 55,
      lines: 60,
      statements: 60
    }
  },

  testMatch: [
    '<rootDir>/src/**/*.test.{ts,tsx}',
    '<rootDir>/tests/**/*.test.{ts,tsx}'
  ],

  // Performance
  passWithNoTests: true,
  maxWorkers: process.env.CI ? 2 : '50%',  // Limit CI workers (memory constrained)
  testTimeout: 30000,   // 30s — IndexedDB operations can be slow
  slowTestThreshold: 5, // Warn about tests > 5s

  // CRITICAL: Leak detection
  detectOpenHandles: true,  // Catches unclosed DB connections, timers, etc.
  detectLeaks: false,       // High false-positive rate — disabled
  forceExit: false,         // NEVER use forceExit — masks real issues

  // CI configuration
  silent: process.env.CI === 'true',
  verbose: process.env.CI !== 'true',
};

export default createJestConfig(customJestConfig);
```

**Key traps**:
- `import nextJest from 'next/jest.js'` — the `.js` extension is REQUIRED for ESM imports.
- `detectOpenHandles: true` — catches resource leaks. Never disable this.
- `forceExit: false` — using `forceExit: true` hides real resource leak bugs. Fix the leaks instead.
- `maxWorkers` in CI: Use `2` not `'50%'` — CI containers have limited memory and will OOM with more workers.
- `testTimeout: 30000` — IndexedDB operations + React rendering can be slow in jsdom.

---

## 4. eslint.config.mjs (Flat Config)

```javascript
// Next.js 16+ native flat config
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // Global ignores
  {
    ignores: [
      ".next/**", "node_modules/**", "out/**", "coverage/**",
      "test-results/**", "docs/**", "__mocks__/**", "types/**",
      "public/**", "site/**", "eslint/**",
      "*.config.js", "*.config.mjs",
      "sentry.*.config.ts",
    ],
  },
  // Next.js recommended rules
  ...nextVitals,
  ...nextTypescript,
  // Custom rules
  {
    rules: {
      "react-hooks/exhaustive-deps": "error",     // CRITICAL: Prevents stale closure bugs
      // React 19 eslint-plugin-react-hooks v7 — catches mutation bugs, ref misuse
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/refs": "error",
      "react-hooks/immutability": "error",
      "react-hooks/globals": "error",
      "no-console": "error",                       // Force use of logger utility
      // Prevent direct localStorage usage — IndexedDB-only policy
      "no-restricted-globals": [
        "error",
        {
          "name": "localStorage",
          "message": "Direct localStorage usage is not allowed. Use storage helper instead for IndexedDB-only compliance."
        }
      ],
      "@typescript-eslint/no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",                 // Allow _unused pattern
        "varsIgnorePattern": "^_"
      }],
      // ADAPT: Add project-specific rules here
    },
  },
  {
    // Allow console and localStorage in specific utility files
    files: ["src/utils/logger.ts", "src/setupTests.mjs"],
    rules: {
      "no-console": "off",
      "no-restricted-globals": "off",
    },
  },
  {
    // Relax rules for test files
    files: ["**/*.test.ts", "**/*.test.tsx", "tests/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",     // Test mocks often use any
      "@typescript-eslint/ban-ts-comment": "off",      // Tests may need @ts-ignore
      "@typescript-eslint/no-require-imports": "off",   // Some test utils use require
    },
  },
];

export default eslintConfig;
```

**Key traps**:
- Next.js 16+ uses **flat config** natively. Do NOT use `.eslintrc.*` files.
- `"react-hooks/exhaustive-deps": "error"` — NEVER change to `"warn"`. Stale closures cause the hardest-to-debug issues in React.
- `"no-console": "error"` — Forces all logging through a centralized logger. Essential for production apps.

**Custom ESLint plugin**: The source project uses a custom ESLint plugin (`eslint/custom-hooks-plugin.mjs`) that enforces memoization of function props passed to specific hooks. For a new project, consider creating a similar plugin if you have performance-sensitive hooks accepting callback props. See the `custom-hooks/require-memoized-function-props` rule in the source project's ESLint config for the pattern.

---

## 5. tailwind.config.js

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',  // Scan all source files for class names
  ],
  theme: {
    extend: {
      screens: {
        'xs': '475px',  // OPTIONAL: Extra-small breakpoint for mobile
      },
      fontFamily: {
        // ADAPT: Change to your app's font
        sans: ['var(--font-rajdhani)', 'Inter', 'sans-serif'],
        display: ['var(--font-rajdhani)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
```

---

## 6. postcss.config.mjs

```javascript
const config = {
  plugins: ["@tailwindcss/postcss"],  // Tailwind 4 uses PostCSS plugin
};

export default config;
```

**Key trap**: Tailwind CSS 4 uses `@tailwindcss/postcss`, NOT `tailwindcss`. The plugin name changed in v4.

---

## 7. .env.example

```bash
# ============================================================================
# BACKEND MODE
# ============================================================================
NEXT_PUBLIC_BACKEND_MODE=local
# Options: 'local' (IndexedDB only) or 'cloud' (Supabase + IndexedDB)

# ============================================================================
# SUPABASE (Required for cloud mode)
# ============================================================================
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
# Get from: https://supabase.com/dashboard/project/_/settings/api

# ============================================================================
# SENTRY (Error Reporting — Production)
# ============================================================================
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=          # Server-side only — for source map uploads
SENTRY_ORG=
SENTRY_PROJECT=

# ============================================================================
# DEVELOPMENT
# ============================================================================
NEXT_PUBLIC_SENTRY_FORCE_ENABLE=false  # Force Sentry in dev mode
ANALYZE=false                          # Bundle analysis
```

**Key rules**:
- `NEXT_PUBLIC_*` = exposed to client browser. NEVER put secrets here.
- Server-side secrets (like `SENTRY_AUTH_TOKEN`) NEVER get `NEXT_PUBLIC_` prefix.
- Supabase `anon` key is safe for client-side — it's designed to be public (RLS protects data).

---

## 8. next.config.ts — Key Patterns

The full config is complex. Here are the critical patterns to replicate:

### Security Headers

```typescript
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Required by Next.js
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://*.supabase.co https://*.ingest.sentry.io https://*.sentry.io",
      "worker-src 'self'",           // Service worker
      "object-src 'none'",           // Block plugins
      "frame-ancestors 'none'",      // Prevent iframe embedding
      "form-action 'self'",          // Restrict form submissions
      "base-uri 'self'",
      "upgrade-insecure-requests",   // Force HTTPS for all resources
    ].join('; '),
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Report-To',
    value: JSON.stringify({
      group: 'csp-endpoint',
      max_age: 10886400,
      endpoints: [{ url: '/api/csp-report' }],
    }),
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];
```

### Cache Control for PWA Files

```typescript
// CRITICAL: SW and manifest must never be cached
{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' }] },
{ source: '/manifest.json', headers: [{ key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' }] },
```

### Sentry Integration & Async Export

The actual `next.config.ts` uses an async function export to support conditional Sentry wrapping and lazy bundle analyzer:

```typescript
import { withSentryConfig } from '@sentry/nextjs';

// Only wrap with Sentry in production
const shouldUseSentry = process.env.NEXT_PUBLIC_SENTRY_DSN &&
  (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE === 'true');

// Async export — supports lazy-loaded bundle analyzer and conditional Sentry
export default async function buildConfig(): Promise<NextConfig> {
  // Bundle analyzer — lazy-load to avoid requiring devDependencies when ANALYZE is not set
  let withBundleAnalyzer = (config: NextConfig) => config;
  if (process.env.ANALYZE === 'true') {
    const { default: bundleAnalyzer } = await import('@next/bundle-analyzer');
    withBundleAnalyzer = bundleAnalyzer({ enabled: true });
  }

  const configWithAnalyzer = withBundleAnalyzer(nextConfig);

  return shouldUseSentry
    ? withSentryConfig(configWithAnalyzer, sentryWebpackPluginOptions)
    : configWithAnalyzer;
}
```

**Key traps**:
- The export is an **async function**, not a simple object or synchronous default export. Next.js 16+ supports this.
- `'unsafe-inline'` and `'unsafe-eval'` in CSP are required by Next.js for hydration scripts. Removing them breaks the app.
- Service worker (`sw.js`) MUST have `no-cache` headers. Caching an old SW prevents updates.
- Sentry wrapping should be conditional — don't slow down dev builds with source map uploads.
