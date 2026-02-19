# Blueprint: How to Build a Local-First PWA with Supabase Cloud Sync

> **Audience**: AI agent (Claude, GPT, etc.) tasked with building a new app
> **Source**: Extracted from MatchOps-Local — a production soccer coaching PWA

---

## What This Is

This blueprint documents every architectural decision, configuration, pattern, and gotcha from building MatchOps-Local — a local-first Progressive Web App with optional Supabase cloud sync. Use it to build a structurally identical app with a different domain.

**This is NOT documentation.** These are **build instructions** written for an AI agent. Each file tells you:
- **What** to build
- **WHY** it was designed this way (so you don't deviate)
- **HOW** to build it (with copy-paste-ready code and configs)
- **TRAPS** to avoid (things that cost hours to debug)

---

## Tech Stack

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| Framework | Next.js (App Router) | 16.x | File-based routing, SSR for SEO pages, zero-config Vercel deploy |
| UI | React | 19.x | Concurrent features, server components |
| Language | TypeScript | 5.x | Strict mode, self-documenting interfaces |
| Styling | Tailwind CSS | 4.x | Zero runtime, utility-first, small bundles |
| Local Storage | IndexedDB via `idb` | 8.x | 50MB+ quota, structured data, transactional |
| Cloud Database | Supabase (PostgreSQL) | 2.x | Open source, RLS, built-in auth, Edge Functions |
| Auth | Supabase Auth | 2.x | Email/password, free, integrated with RLS |
| State (async) | React Query | 5.x | Cache, retry, loading states, mutations |
| State (sync) | useReducer | React built-in | Atomic multi-field updates, undo/redo |
| i18n | i18next | 25.x | Namespaces, type-safe keys, pluralization |
| Error Monitoring | Sentry | 10.x | Auto error grouping, session replay, traces |
| Testing | Jest + RTL | 30.x | Mature, built-in mocking, Next.js support |
| Browser Testing | agent-browser | 0.10+ | AI-agent browser automation, compact snapshots, 93% less context than Playwright MCP |
| Deployment | Vercel | - | Zero-config Next.js hosting |
| PWA | Custom Service Worker | - | Full control over caching strategy |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          NEXT.JS APP                                │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Route A  │  │ Route B  │  │ Route C  │  │ Route D  │  (pages)  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │              │              │              │                 │
│       ▼              ▼              ▼              ▼                 │
│  ┌──────────────────────────────────────────────────────┐           │
│  │              CUSTOM HOOKS (per feature)              │           │
│  │  useReducer (synchronous)  +  React Query (async)    │           │
│  └────────────────────────┬─────────────────────────────┘           │
│                           │                                         │
│  ┌────────────────────────▼─────────────────────────────┐           │
│  │              DATASTORE INTERFACE                      │           │
│  │         (backend-agnostic contract)                   │           │
│  └────────┬──────────────────────────┬──────────────────┘           │
│           │                          │                               │
│  ┌────────▼────────┐      ┌─────────▼─────────┐                    │
│  │  LocalDataStore │      │ SupabaseDataStore  │                    │
│  │   (IndexedDB)   │      │  (PostgreSQL)      │                    │
│  └─────────────────┘      └─────────┬──────────┘                    │
│                                     │                                │
│  ┌──────────────────────────────────▼──────────────────────────┐    │
│  │              SUPABASE CLOUD                                  │    │
│  │  PostgreSQL + RLS + Auth + Edge Functions                    │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │              PWA LAYER                                       │    │
│  │  Service Worker + Manifest + Install Prompt + Offline Page   │    │
│  └──────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Dual-Mode Operation

```
User chooses at first launch:

LOCAL MODE                          CLOUD MODE
├── No account required             ├── Email/password signup
├── All data in IndexedDB           ├── Data in Supabase PostgreSQL
├── Works fully offline             ├── Cross-device sync
├── Zero network requests           ├── Online required for writes
└── Can migrate to cloud later      └── Can migrate to local later
```

---

## Document Index

Read these in order when building a new app. Each file is self-contained but builds on previous ones.

### Foundation (Read First)

| # | File | What You'll Learn |
|---|------|-------------------|
| 01 | [01-build-sequence.md](./01-build-sequence.md) | Phase-by-phase build order — what to build first |
| 02 | [02-decisions.md](./02-decisions.md) | WHY every tech choice was made — prevents deviations |
| 03 | [03-configurations.md](./03-configurations.md) | Exact config files with annotations — copy-paste ready |

### Core Architecture

| # | File | What You'll Learn |
|---|------|-------------------|
| 04 | [04-core-interfaces.md](./04-core-interfaces.md) | DataStore, AuthService, core types — the skeleton |
| 05 | [05-data-layer.md](./05-data-layer.md) | IndexedDB, storage adapters, DataStore implementations |
| 06 | [06-state-and-hooks.md](./06-state-and-hooks.md) | React Query, useReducer, custom hooks, wiring |
| 07 | [07-auth-and-providers.md](./07-auth-and-providers.md) | Auth flow, context providers, nesting order |

### Cloud Backend

| # | File | What You'll Learn |
|---|------|-------------------|
| 08 | [08-supabase-playbook.md](./08-supabase-playbook.md) | Schema, RLS, migrations, RPC, Edge Functions |
| 09 | [09-sync-engine.md](./09-sync-engine.md) | Local-first sync, queue, conflict resolution |

### PWA & UI

| # | File | What You'll Learn |
|---|------|-------------------|
| 10 | [10-pwa-playbook.md](./10-pwa-playbook.md) | Service worker, manifest, install, offline, update |
| 11 | [11-ui-patterns.md](./11-ui-patterns.md) | Routes, components, modals, forms, interactive canvas |

### Supporting Systems

| # | File | What You'll Learn |
|---|------|-------------------|
| 12 | [12-i18n.md](./12-i18n.md) | i18next setup, type generation, translation patterns |
| 13 | [13-testing-playbook.md](./13-testing-playbook.md) | Jest setup, mocking IndexedDB, async patterns |
| 14 | [14-error-handling.md](./14-error-handling.md) | Sentry, typed errors, retry, toasts, sanitization |
| 15 | [15-build-and-deploy.md](./15-build-and-deploy.md) | Build pipeline, Vercel, env vars, CSP headers |

### Reference

| # | File | What You'll Learn |
|---|------|-------------------|
| 16 | [16-gotchas.md](./16-gotchas.md) | Every trap and lesson learned — the expensive knowledge |
| 17 | [17-data-model-sketch.md](./17-data-model-sketch.md) | Practice app entity design (domain-specific) |
| 18 | [18-app-vision.md](./18-app-vision.md) | What the practice app IS — features, users, flows, scope |

---

## Key Principles

1. **Local-first**: The app works offline with zero network. Cloud sync is an optional upgrade.
2. **Interface-driven**: All data access goes through TypeScript interfaces. Backends are swappable.
3. **Single-user**: One coach per account. No multi-tenant, no collaboration features.
4. **Production-quality**: No MVP shortcuts. Sanitized error messages, retry logic, proper error handling.
5. **Test-covered**: 4500+ tests. Every layer has unit tests. No flaky tests allowed.

---

## What to Do Differently (vs MatchOps-Local)

These are the tech debt items identified in the source project. The new app should NOT replicate them:

| Issue | MatchOps Did | New App Should |
|-------|-------------|----------------|
| DataStore interface | Single god interface (~40 methods) | Split by domain (PlayerStore, PracticeStore, etc.) |
| Directory structure | Flat `src/components/` (100+ files) | Feature-based (`src/features/practice/`, etc.) |
| Page architecture | Single-page orchestrator (1240 lines) | Next.js routes per feature |
| Storage adapters | 6 abstraction layers | `idb` directly, one thin adapter |
| Hook dependencies | 17+ deps in orchestration hook | Route-scoped hooks, <8 deps each |
| Modal system | Central registry (40+ modals) | Feature-owned modals with `@headlessui/react` |

See [02-decisions.md](./02-decisions.md) for detailed rationale.
