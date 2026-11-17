# Active Plans — START HERE

**Last Updated**: 2026-11-17
**Status**: 🚀 Live in production (Google Play, 2026-06-09) · **Free** (no billing)

---

## 🎯 Single Source of Truth

**[UNIFIED-ROADMAP.md](./UNIFIED-ROADMAP.md)** — all remaining work, prioritized P0→P4.

---

## Active Documents

| File | Purpose |
|------|---------|
| **UNIFIED-ROADMAP.md** | Prioritized roadmap (P0 live fixes → P4 big bets) |
| **user-flow-testing-plan.md** | Manual QA checklist (post-launch verification) |

**Archived** (moved to `08-archived/completed-active-plans/`): Play Store plan, master-execution-guide, billing-implementation-plan, review-plan, branch-review-findings, welcome-screen, communication-infrastructure. Their still-open items were folded into the roadmap.

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
- `archive/planner-integration` — scrapped Planner impl (replan: #369)
- `archive/desktop-responsive-modals` — desktop UI ideas (rebuild: #360)
