# Active Plans — START HERE

**Last Updated**: 2026-11-20
**Status**: 🚀 Live in production (Google Play, 2026-06-09) · **Free** (no billing)

---

## 🎯 Single Source of Truth

**[UNIFIED-ROADMAP.md](./UNIFIED-ROADMAP.md)** — all remaining work, prioritized P0→P4.

---

## Active Documents

| File | Purpose |
|------|---------|
| **UNIFIED-ROADMAP.md** | Prioritized roadmap (P0 live fixes → P4 big bets); open work only, history at the bottom |
| **code-review-findings-2026-06-25.md** | Full review 2026-11 fix checklist - complete except owner tasks 2.2, 2.3, 2.5 |
| **new-user-funnel-fix-plan.md** | Onboarding v3 plan (shipped) + new-user funnel; target of open task 2.5 |
| **user-flow-testing-plan.md** | Manual QA checklist (post-launch verification) |
| **data-safety-and-backup.md** | Backup layers; Layer 3 (cloud snapshots) still open/deferred |
| **kirjuri-ai-plan.md** | Kirjuri voice notes + BYOK AI (shipped, experimental); design reference and open decisions |
| **player-development-assessment-plan.md** | Assessment design reference (shipped, off by default since 2026-09-09) |
| **playing-time-fairness-and-planner.md** | Planner build plan (shipped); §10 holds the open modal-chrome item |
| **desktop-workspaces-plan.md** | Desktop UI - parked as an idea (2026-09-16) |

**Archived** (moved to `08-archived/completed-active-plans/`): Play Store plan, master-execution-guide, billing-implementation-plan, review-plan, branch-review-findings, welcome-screen, communication-infrastructure; and on 2026-11-20 the finished feature plans: friendly-matches, game-lifecycle-completeness, game-recap-generator, home-dashboard, marketing-site-revamp, onboarding-funnel, overtime-penalty-shootout, player-positions-per-game, two-level-app-structure, play-store-release-notes-1.0.8. Their still-open items were folded into the roadmap.

---

## Current Focus

What is being worked on and what is done lives in **[UNIFIED-ROADMAP.md](./UNIFIED-ROADMAP.md)** only - not repeated here, so it cannot go stale (the old P0 list here kept three items open that the roadmap had closed on 2026-06-18 and 2026-09-10).

Monetization is **parked** (going free). If we ever go paid, it needs a full replan — see archived `billing-implementation-plan.md`.

### Supabase Projects

| Project | ID | Purpose |
|---------|-------------|---------|
| `matchops-cloud` | `aybjmnxxtgspqesdiqxd` | Production |
| `matchops-staging` | `uncyxrffqrloypgjalzz` | Testing (recreated 2026-06-22; `npm run dev` points here via `.env.development`) |

### Preserved code snapshots (git tags)

- `archive/pre-cloud-backup` — app state before cloud work
- `archive/planner-integration` — scrapped Planner impl (#369, absorbed by the shipped Playing-Time Planner)
- `archive/desktop-responsive-modals` — desktop UI ideas (#360, parked)
