# MatchOps — Complete Repository History

MatchOps was developed across multiple repositories over its lifetime. This document records the full history for reference.

## Repository Timeline

```
soccer-pre-game-app    Apr 10, 2025 ─────────── Aug 16, 2025    (archived, private)
                              │
                              │ codebase carried forward (not git-branched)
                              ▼
MatchOps-Cloud         Aug 20, 2025 ─────────────── Dec 25, 2025 (archived, private)
MatchOps-Local         Aug 20, 2025 ──────────────────────── now  (active, private)
                              │
                              │ diverged Jul 22, 2025 (shared history before that)
                              │
MatchOps (public)      Feb 27, 2026                               (showcase, public)
```

## Aggregate Statistics

| Metric | soccer-pre-game-app | MatchOps-Cloud | MatchOps-Local | Total |
|---|---|---|---|---|
| **Commits** | 1,694 | 1,750 | 2,815 | 6,259 |
| **Pull Requests** | 270 | 6 | 220 | 496 |
| **Open Issues** | 0 | 1 | 7 | 8 |
| **Active Period** | Apr–Aug 2025 | Aug–Dec 2025 | Aug 2025–present | Apr 2025–present |
| **Duration** | ~4 months | ~4 months | ~7 months ongoing | ~11 months ongoing |

**Note on commit counts:** MatchOps-Cloud and MatchOps-Local share git history up to Jul 22, 2025. Roughly ~1,050 commits are shared between them. Deduplicated total is approximately **5,200 unique commits**.

## Per-Repository Details

### soccer-pre-game-app (archived)

- **GitHub**: `VillePajala/soccer-pre-game-app` (private)
- **Created**: Apr 10, 2025
- **Last commit**: Aug 16, 2025
- **Commits**: 1,694 (1,693 VillePajala, 1 cursoragent)
- **Pull Requests**: 270
- **Description**: "An interactive web-based soccer game management app"
- **Tech stack**: TypeScript (3.4 MB), JavaScript (87 KB), PLpgSQL (69 KB), HTML (31 KB), CSS (7 KB), Shell (4 KB)
- **Repo size**: 18 MB
- **Role**: Original repository. The project started here as "soccer-pre-game-app" and was later renamed/rebranded to MatchOps. The codebase was carried forward to new repositories but git history was NOT preserved (fresh `create-next-app` init in the new repos).

### MatchOps-Cloud (archived)

- **GitHub**: `VillePajala/MatchOps-Cloud` (private)
- **Created**: Aug 20, 2025
- **Last commit**: Dec 25, 2025
- **Commits**: 1,750 (1,748 VillePajala, 1 cursoragent, 1 vercel[bot])
- **Pull Requests**: 6
- **Tech stack**: TypeScript (5.0 MB), JavaScript (95 KB), PLpgSQL (69 KB), HTML (31 KB), CSS (7 KB), Shell (4 KB)
- **Repo size**: 19 MB
- **Role**: Cloud/deployment variant. Shares git history with MatchOps-Local up to Jul 22, 2025. After that date, Cloud diverged with its own changes (HomePage refactoring, Vercel-specific updates). Last meaningful development was Sep 5, 2025; final commit was a CVE security fix on Dec 25, 2025.

### MatchOps-Local (active)

- **GitHub**: `VillePajala/MatchOps-Local` (private)
- **Created**: Aug 20, 2025
- **Last commit**: ongoing
- **Commits**: 2,815 (2,806 VillePajala, 5 claude, 2 vercel[bot], 1 cursoragent, 1 github-actions[bot])
- **Pull Requests**: 220
- **Open Issues**: 7
- **Tags**: 2
- **Tech stack**: TypeScript (7.4 MB), MDX (160 KB), JavaScript (106 KB), PLpgSQL (95 KB), HTML (39 KB), CSS (25 KB), Shell (3 KB)
- **Repo size**: 111 MB
- **Role**: Primary active repository. All current development happens here. Local-first architecture with Supabase backend.

### MatchOps (public showcase)

- **GitHub**: `VillePajala/MatchOps` (public)
- **Created**: Feb 27, 2026
- **Commits**: 1
- **Description**: "Professional soccer coaching PWA — tactics, live tracking, statistics & team management. Built with Next.js 16, React 19, TypeScript, Supabase & IndexedDB."
- **Role**: Public-facing showcase repository with README, architecture docs, and screenshots. Does not contain application source code.

## How the Repositories Relate

1. **soccer-pre-game-app** was the original project, started Apr 10, 2025
2. On **Aug 20, 2025**, two new repos were created (MatchOps-Cloud and MatchOps-Local) with a fresh `create-next-app` init — the codebase was copied but git history was not carried over
3. **MatchOps-Cloud and MatchOps-Local** shared the same git history until **Jul 22, 2025**, then diverged — Cloud pursued deployment/Vercel features while Local continued core development
4. **soccer-pre-game-app** received its last commit on **Aug 16, 2025**
5. **MatchOps-Cloud** received its last commit on **Dec 25, 2025** (security patch only)
6. **MatchOps-Local** is the sole active repository as of 2026
7. **MatchOps** (public) was created Feb 27, 2026 as a showcase — README and screenshots only

## AI Tooling Used

Across the project's history, development was assisted by:
- **Cursor Agent** (cursoragent) — early commits
- **Claude** — later commits in MatchOps-Local
- **GitHub Codex** — PR-based contributions (visible in soccer-pre-game-app PR branch names like `codex/...`)
- **Vercel Bot** — automated dependency/security updates
