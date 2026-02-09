# Active Plans — START HERE

**Last Updated**: February 2026

---

## 🎯 Single Source of Truth

**[UNIFIED-ROADMAP.md](./UNIFIED-ROADMAP.md)** — All project work in one place

---

## Active Documents

| File | Purpose | Status |
|------|---------|--------|
| **UNIFIED-ROADMAP.md** | Master roadmap with all tasks | ✅ Updated |
| **master-execution-guide.md** | Play Store release details | 📋 Active |
| **billing-implementation-plan.md** | Play Billing & subscriptions | ✅ Phases 1-7 Complete |
| **PLAY-STORE-IMPLEMENTATION-PLAN.md** | Play Store distribution | 📋 Active |
| **branch-review-findings.md** | Code review findings tracker | 📋 Reference |
| **user-flow-testing-plan.md** | Manual testing plan | 📋 Pre-release |
| **welcome-screen-simplification-plan.md** | Welcome screen UX | 📋 Reference |

**Note**: Completed plans (supabase-implementation-guide, local-first-sync, subscription, etc.) have been archived to `08-archived/completed-active-plans/`. The supabase-implementation-guide has been relocated to `02-technical/` as permanent reference.

---

## Current Status (February 2026)

✅ **Supabase Cloud Backend** — PRs 1-12 Complete
✅ **Local-First Sync** — PR #324 Merged
✅ **Billing Infrastructure** — Phases 1-7 Complete
✅ **Staging Environment** — Configured and tested
✅ **Code Reviews** — 5 rounds complete, all actionable items fixed

| Metric | Value |
|--------|-------|
| Tests | ~4,500+ passing |
| Vulnerabilities | 0 |
| Framework | Next.js 16.0.10 + React 19.2 |
| Cloud Backend | Supabase (PostgreSQL + Auth + Edge Functions) |

### Supabase Projects

| Project | ID | Purpose |
|---------|-------------|---------|
| `matchops-cloud` | `aybjmnxxtgspqesdiqxd` | Production (real billing) |
| `matchops-staging` | `hwcqpvvqnmetjrwvzlfr` | Preview/testing (mock billing) |

See [billing-implementation-plan.md](./billing-implementation-plan.md#staging-vs-production-architecture) for setup details.

**Next**:
1. Business setup (Toiminimi, bank account, Google Payments)
2. Enable `PREMIUM_ENFORCEMENT_ENABLED = true`
3. Merge feature branch to master
4. Rebuild TWA with Play Billing enabled

See [UNIFIED-ROADMAP.md](./UNIFIED-ROADMAP.md) for details.
