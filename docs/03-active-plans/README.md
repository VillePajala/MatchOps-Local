# Active Plans — START HERE

**Last Updated**: 2026-01-26

---

## 🎯 Single Source of Truth

**[UNIFIED-ROADMAP.md](./UNIFIED-ROADMAP.md)** — All project work in one place

---

## Active Documents

| File | Purpose | Status |
|------|---------|--------|
| **UNIFIED-ROADMAP.md** | Master roadmap with all tasks | ✅ Updated |
| **supabase-implementation-guide.md** | Cloud backend implementation | ✅ Complete |
| **billing-implementation-plan.md** | Play Billing & subscriptions | ✅ Phases 1-7 Complete |
| **local-first-sync-plan.md** | Local-first sync architecture | ✅ Complete (PR #324) |
| master-execution-guide.md | Play Store release details | 📋 Reference |
| subscription-implementation-plan.md | Subscription model | ✅ Implemented |

---

## Current Status (January 2026)

✅ **Supabase Cloud Backend** — PRs 1-11 Complete
✅ **Local-First Sync** — PR #324 Merged
✅ **Billing Infrastructure** — Phases 1-7 Complete
✅ **Staging Environment** — Configured for preview testing

| Metric | Value |
|--------|-------|
| Tests | 3,500+ passing |
| Vulnerabilities | 0 |
| Framework | Next.js 16.0.10 + React 19.2 |
| Branch | `supabase/billing-implementation` |

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
