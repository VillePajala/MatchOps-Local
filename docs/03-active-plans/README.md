# Active Plans — START HERE

**Last Updated**: 2026-06-10
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

## Current Focus (P0)

1. **Store-listing accuracy** — listing/README still claim "offline / no account / optional cloud"; the Play build is cloud-only.
2. **Stop publishing internal docs** — `copy-docs.js` publishes `11-blueprint` + archive tarball to the public site.
3. **`get_user_consent` stale 'granted'** (#371) — make it status-aware.

Monetization is **parked** (going free). If we ever go paid, it needs a full replan — see archived `billing-implementation-plan.md`.

### Supabase Projects

| Project | ID | Purpose |
|---------|-------------|---------|
| `matchops-cloud` | `aybjmnxxtgspqesdiqxd` | Production |
| `matchops-staging` | `hwcqpvvqnmetjrwvzlfr` | Preview/testing |

### Preserved code snapshots (git tags)

- `archive/pre-cloud-backup` — app state before cloud work
- `archive/planner-integration` — scrapped Planner impl (replan: #369)
- `archive/desktop-responsive-modals` — desktop UI ideas (rebuild: #360)
