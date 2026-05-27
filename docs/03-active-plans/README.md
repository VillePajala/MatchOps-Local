# Active Plans — START HERE

**Last Updated**: 2026-05-19

---

## 🎯 Single Source of Truth

**[UNIFIED-ROADMAP.md](./UNIFIED-ROADMAP.md)** — All project work in one place

**Current release boundary:** the Friday, 2026-05-22 Play Store release should stay on `master` and release-critical fixes only. Planner work remains in its own feature lane.

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
| **tester-feedback-roadmap.md** | Closed-test feedback execution plan | 📋 Production readiness |
| **welcome-screen-simplification-plan.md** | Welcome screen UX | 📋 Reference |
| **review-plan.md** | Pre-launch quality audit tracker | 📋 Active |
| **planner-roadmap.md** | Canonical future roadmap for match planner cleanup/rebuild | 📋 Future feature |

**Note**: Completed plans (supabase-implementation-guide, local-first-sync, subscription, etc.) have been archived to `08-archived/completed-active-plans/`. The supabase-implementation-guide has been relocated to `02-technical/` as permanent reference.

---

## Current Status (May 2026)

✅ **Supabase Cloud Backend** — PRs 1-12 Complete
✅ **Local-First Sync** — PR #324 Merged
✅ **Billing Infrastructure** — Phases 1-7 Complete
✅ **Staging Environment** — Configured and tested
✅ **Code Reviews** — 27 rounds complete, converged at R27 (zero findings)
✅ **Documentation Review** — 6-agent review complete, all fixes applied

| Metric | Value |
|--------|-------|
| Tests | ~4,746 passing |
| Vulnerabilities | 0 |
| Framework | Next.js 16 + React 19 |
| Cloud Backend | Supabase (PostgreSQL + Auth + Edge Functions) |

### Supabase Projects

| Project | ID | Purpose |
|---------|-------------|---------|
| `matchops-cloud` | `aybjmnxxtgspqesdiqxd` | Production (real billing) |
| `matchops-staging` | `hwcqpvvqnmetjrwvzlfr` | Preview/testing (mock billing) |

See [billing-implementation-plan.md](./billing-implementation-plan.md#staging-vs-production-architecture) for setup details.

**Next**:
1. Keep `master` focused on the Play Store release.
2. Fold closed-test feedback into production-readiness work via [UNIFIED-ROADMAP.md](./UNIFIED-ROADMAP.md) and [tester-feedback-roadmap.md](./tester-feedback-roadmap.md).
3. Finish release-critical testing, packaging, and production access answers.
4. Keep planner work isolated on `feature/planner-integration` and follow [planner-roadmap.md](./planner-roadmap.md).
5. Revisit planner cutover after the Play Store release.

See [UNIFIED-ROADMAP.md](./UNIFIED-ROADMAP.md) for details.
