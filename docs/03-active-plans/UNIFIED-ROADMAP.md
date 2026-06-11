# MatchOps-Local: Unified Project Roadmap

**Last Updated**: 2026-06-10
**Status**: 🚀 **LIVE IN PRODUCTION** (Google Play, released 2026-06-09) · **Free** (no billing)
**Purpose**: Single, prioritized source of truth for remaining work.

> Consolidated and triaged post-launch (2026-06-10). Monetization is parked (going free).
> Completed/scrapped plans were archived to `docs/08-archived/completed-active-plans/`.
> Speculative feature ideas live in `docs/04-features/future-vision.md` — not deleted, just
> off the active roadmap. Preserved code snapshots: git tags `archive/pre-cloud-backup`,
> `archive/planner-integration`, `archive/desktop-responsive-modals`.

Priorities are **P0 (do first) → P4 (someday)**, ordered by what matters most for a free,
solo-maintained, just-launched app: live correctness first, then observability, then UX, then
features, then big bets.

---

## 🔴 P0 — Fix because we're live

Real issues affecting production users / exposure right now. Small, high-leverage.

- [ ] **Store-listing accuracy** — `store-description-en.md:52/54/63/67` and root `README.md` still say "works offline / no account / optional cloud sync," but the Play build is **cloud-only (account required)**. Misleading to users; possible policy risk. Rewrite the listing copy + README framing.
- [ ] **Stop publishing internal docs** — `site/scripts/copy-docs.js` only excludes `08-archived`; it currently publishes `docs/11-blueprint/` (internal "how to clone this app" build instructions) and a 2.4 MB `08-archived.tar.gz` to the public docs site. Add `11-blueprint`, `10-analysis`, and `08-archived.tar.gz` to `excludeDirs`.
- [ ] **`get_user_consent` returns stale 'granted'** (#371) — function orders by `consented_at DESC` but never reads the `status` column, so a withdrawn consent still reads as granted. GDPR-correctness. Fix: new migration making `get_user_consent` status-aware (`008_user_consents.sql:155`). While in that code, also regenerate `src/types/supabase.ts` (missing `user_consents.status`) and optionally apply the two minor consent hardening notes (uuid id, month regex) closed from #374/#375.

---

## 🟠 P1 — Observability (we just launched — get eyes on it)

- [ ] **Sentry release tagging** — web build reports `release: 1.0.0` regardless of version; wire the real version/commit so errors can be sliced by release.
- [ ] **Sentry alerting** — configure alert rules for crash-rate / new-issue spikes (notifications already route to alerts@velomoai.com).
- [ ] **Reduce Sentry storage-retry noise** — `storage.ts:829/871/908/768` log `error` (→ Sentry) on *every* retry, including recovered transient IndexedDB failures. Log non-final attempts at `warn`; reserve `error` for final failure.
- [ ] **CI audit gate** — fail CI on critical production dependency vulnerabilities.

---

## 🟡 P2 — UX & quality polish

- [ ] **Play Store data-deletion declaration** (deferred 2026-06-11) — Data Safety form wrongly says the app offers no data deletion; full account deletion exists (Settings → Delete Account → `delete-account` Edge Function). Steps: 1) verify deletion flow end-to-end with a throwaway account, 2) add `/delete-account` page to marketing site (Google wants a web deletion-request URL), 3) update Data Safety form in Play Console.
- [ ] **Local device-data wipe on account deletion** (added 2026-06-11) — account deletion removes cloud data + auth user but leaves the user-scoped IndexedDB mirror (`matchops_user_{id}`) and sync-queue DB on the device forever. Add best-effort `indexedDB.deleteDatabase()` for both after successful deletion (in `AuthProvider.deleteAccount`), and consider the same on the reverse-migration "delete cloud account" path. Orphaned storage + readable data on shared devices.
- [ ] **Core accessibility** — color contrast, touch targets, keyboard nav, screen-reader support.
- [ ] **Season League UX filters** — group the 34-league flat list by area (Itä/Länsi/Etelä) + age group in `SeasonDetailsModal`. ~1 week.
- [ ] **Site polish** (bundled, ~15 min) — add 9 missing FI keys under `features.foundation.*` in `site/public/locales/fi/common.json`; fix `site/README.md` (says Next 15, actual 16).

---

## 🟢 P3 — Feature backlog (value/effort ordered)

Low-effort, high-value first. Detailed concepts in `docs/04-features/future-vision.md`.

| Feature | Effort | Note |
|---------|--------|------|
| Player Milestones & Certificates | Low | Auto-detect 10/25/50/100 appearances; exportable. High youth-motivation value. |
| Quick Post-Game Ratings | Low | 30s/player across 7 dimensions; better youth-dev signal than goals. |
| Configurable Formations | Low | TODO in `useFieldCoordination.ts`. |
| Overtime & penalty shootout (#273) | Low | Real gap for knockout games. |
| Substitution "who came off" field (#381) | Low-Med | Substitution GameEvent lacks outgoing-player → blocks who-came-off stats. (Decoupled from the scrapped Planner.) |
| Formation Templates (one-tap switch) | Med | Save/switch formations; ends 11-player drag pain. |
| Moment Capture (tap-to-log) | Med | 2-tap logging of notable plays; goals/assists miss most player value. |
| Field Export (image / PDF) | Med | Shareable field + lineup. |
| Futsal Field Visualization | Med | Completes existing futsal support (smaller court, 5 players). |
| Visual Analytics | Med | Charts, event timeline, goal-log filtering. |
| Age-appropriate assessment profiles (#364) | Med | U8-U10 simplified, U13+ full. Aligns with youth focus. |

---

## 🔵 P4 — Big bets (need planning before any code)

- [ ] **Tournament Planner — full replan** (#369) — multi-game lineup planning + game-day propagation. Previous implementation scrapped; decide standalone app vs in-app. Old code at tag `archive/planner-integration`.
- [ ] **Desktop responsive UI** (#360) — phone-frame / desktop layout. To be rebuilt from scratch; clever ideas preserved at tag `archive/desktop-responsive-modals`.
- [ ] **AI Assistant (chat with your data)** — long-term flagship. LLM function-calling over the user's games/players/stats. **Prerequisite:** richer data collection first. (Premium-shaped, but billing is parked.)

---

## 🧪 Post-launch QA (verification pass, not features)

Manual checklists `TESTING-PLAN.md` (root) + `user-flow-testing-plan.md` are unexecuted — run as a verification sweep when convenient. Specific gaps to confirm: session-expiry handling, auth-init timeout recovery, post-login marketing-consent prompt. ⚠️ The "Free Limits" test is stale (premium enforcement is off / app is free).

---

## 📁 Reference

| Purpose | Location |
|---------|----------|
| This roadmap | `docs/03-active-plans/UNIFIED-ROADMAP.md` |
| Post-launch QA checklists | `docs/03-active-plans/user-flow-testing-plan.md`, `TESTING-PLAN.md` |
| Speculative feature ideas | `docs/04-features/future-vision.md` |
| Supabase implementation reference | `docs/02-technical/supabase-implementation-guide.md` |
| Archived plans (Play Store, billing, reviews, etc.) | `docs/08-archived/completed-active-plans/` |
| Preserved code snapshots | tags `archive/pre-cloud-backup`, `archive/planner-integration`, `archive/desktop-responsive-modals` |
| Open issues | #371 (consent bug), #381 (sub stats), #364, #360, #273, #369 (planner replan) |

---

## ✅ Completed (history)

- **Production launch** (2026-06-09) — Google Play, cloud-only gate enabled, free.
- **Supabase cloud backend** — DataStore abstraction, SupabaseDataStore, both-way migration, local-first sync (SyncQueue/SyncEngine/SyncedDataStore).
- **Billing infrastructure built** (Phases 1-7) — then parked (free); plan archived for an eventual replan.
- **Welcome-screen simplification**, **communication infrastructure** (domains, email routing, Sentry alerts, velomoai.com).
- **Features** — Gender + Game Type labeling/filtering, Personnel Management, Tournament Series & Season Leagues (34 Finnish leagues), First Game Onboarding, External Match Stats, Warm-up Plan, auto-save, backup/restore.
- **Platform** — Next.js 16 + React 19, 0 npm vulns, HomePage refactor (3,725→62 lines), PWA stability, IndexedDB migration.
- **Verified-fixed during triage** — 3 cloud-sync bugs (warmup ID conflict, warmup metadata, games `created_at`) were already fixed (commits `847f0dab`, `b0816143`); CORS extraction, TournamentSeriesManager extraction, jest-axe types all already done.

---

## 📝 Change Log

| Date | Update |
|------|--------|
| 2026-06-10 | 🧹 **Full backlog triage + prioritization.** Parked monetization (going free → closed #171/#172, archived billing plan). Scrapped Planner impl (closed PR #404 + #372/#373/#377/#378/#379, reframed #369, tagged code). Verified-and-discarded 3 phantom cloud-sync bugs + several already-done tech-debt items. Kept #371 (consent), #381, #364, #360, #273. Tagged & deleted desktop branch. Reprioritized everything P0-P4. |
| 2026-06-09 | 🚀 Production release — live on Google Play (cloud-only, free). |
| 2026-01-28 | Docs audit; future-vision features + cloud-sync bugs added to backlog. |
| 2025-12 | Supabase backend, Gender/Game Type features, Next.js 16 + React 19 upgrade. |

---

**Current Focus**: 🔴 P0 — store-listing accuracy, stop publishing internal docs, fix consent `status` bug.
