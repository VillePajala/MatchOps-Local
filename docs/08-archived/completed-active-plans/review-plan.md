# Review Plan — Pre-Launch Quality Audit

**Last Updated**: February 16, 2026
**Purpose**: Track all review areas, their status, and iterations needed before Play Store launch.

---

## Completed Reviews

### Main App Code — 27 Rounds (CONVERGED)

| Round | Agents | Result |
|-------|--------|--------|
| R1–R20 | Various | Iterative fixes |
| R21–R26 | 6x Opus 4.6 | Progressive convergence |
| R27 | 6x Opus 4.6 | **Zero findings — full convergence** |

**Scope**: All `src/`, `supabase/functions/`, `public/sw.js`, `next.config.ts`, root configs.
**Status**: COMPLETE. No further code review rounds needed unless new code is written.

---

### Main App Documentation (`docs/`) — 1 Round + Fixes

| Agent | Scope | Findings | Status |
|-------|-------|----------|--------|
| Agent 1 | CLAUDE.md, docs/README, QUICK_START, USER_MANUAL, 01-project/* | 19 items | FIXED |
| Agent 2 | docs/02-technical/* | Interface docs deprecated, security fixed, schema fixed | FIXED |
| Agent 3 | docs/03-active-plans/* | UNIFIED-ROADMAP, master-execution-guide updated | FIXED |
| Agent 4 | docs/04-features/* | undo-redo limit, warmup backup claim | FIXED |
| Agent 5 | docs/05-development/*, docs/06-testing/* | agents.md, strategy deprecated, maintenance fixed | FIXED |
| Agent 6 | docs/07-business/*, docs/09-specifications/* | Domains, UX terms, 4 docs archived | FIXED |

**Status**: COMPLETE. All actionable items fixed. Deprecation notices added to fundamentally wrong docs.

---

### Marketing Site Guide Content — 2 Rounds, Converged (COMPLETE)

**Location**: `site/content/guide/en/*.mdx` (13 files) + `site/content/guide/fi/*.mdx` (13 files)

| Round | Action | Result |
|-------|--------|--------|
| R1 | 6-agent review (3 EN + 3 FI) | 43 findings (10 HIGH, 11 MEDIUM, 18 FI-specific, 4 LOW) |
| R1 Fix | 6-agent parallel fix | All 43 items resolved |
| R2 | 4-agent verification review | 50 new findings (28 EN, 22 FI) |
| R2 Fix | 4-agent parallel fix + manual conflict resolution | All 50 items resolved |

Key fixes (R1): backup→sync language, select-and-place UX, player fields, personnel roles, assessment metrics, tactical disc behavior, import behavior, wake lock, Finnish Klikkaa→Napauta, Cyrillic corruption, CLAUDE.md Rule 12 update.

Key fixes (R2): Menu item names (6 wrong across multiple files), WelcomeScreen button labels, nonexistent features removed (goalie toggle, clear old seasons), Fair Play Card mechanism corrected, Gender/Age Group fields added, league dropdown fixed, 20 more Klikkaa→Napauta, pull-to-refresh removed, desktop drag note added, player field parity.

**Status**: COMPLETE. Two rounds, all issues resolved.
- **Personnel roles**: Updated to actual 8 roles with correct fields
- **Assessment metrics**: Actual 10 metric names instead of generic categories
- **Tactical disc behavior**: Fixed double-tap descriptions, added goalie disc type
- **Import behavior**: Removed fake merge/skip options (full overwrite only)
- **Wake lock**: Automatic during timer, not a user setting
- **Finnish fixes**: Klikkaa→Napauta (mobile-first), Cyrillic corruption in statistics.mdx, natural phrasing
- **CLAUDE.md Rule 12 updated**: "Online-Only" → "Local-First Sync (SyncedDataStore)" (was causing false positives)

**Status**: COMPLETE.

---

## Pending Reviews

### 2. Marketing Site Translation Files (HIGH PRIORITY)

**Location**: `site/public/locales/en/common.json`, `fi/common.json`, `en/guide.json`, `fi/guide.json`
**Why**: All marketing copy users see on the website. Feature descriptions, taglines, CTA text.
**What to check**:
- [ ] Feature descriptions match actual app capabilities
- [ ] No drag-and-drop language
- [ ] No specific pricing
- [ ] Finnish translations are accurate and natural
- [ ] All translation keys used in code have corresponding entries

| File | Reviewed | Iteration | Notes |
|------|----------|-----------|-------|
| `en/common.json` | [ ] | — | Marketing copy, feature cards, tech stats |
| `fi/common.json` | [ ] | — | Finnish marketing copy |
| `en/guide.json` | [ ] | — | Guide UI strings |
| `fi/guide.json` | [ ] | — | Finnish guide UI strings |

---

### 3. Marketing Site Code & Pages (MEDIUM PRIORITY)

**Location**: `site/pages/*.tsx`, `site/components/*.tsx`, `site/lib/`, `site/styles/`
**Why**: Code quality, accessibility, SEO, correct rendering.
**What to check**:
- [ ] `site/README.md` — claims Next.js 15 (actual: 16.0.10), wrong file names
- [ ] `pages/index.tsx` — feature accuracy, accessibility
- [ ] `pages/privacy.tsx` and `pages/terms.tsx` — rendering matches fixed docs
- [ ] `pages/gallery.tsx` — working screenshot references
- [ ] `pages/marketing-assets.tsx` — asset accuracy
- [ ] `pages/technical.tsx` — tech stats accuracy
- [ ] Component code quality (Layout, PhoneMockup, Guide components)
- [ ] `next.config.mjs` — config correctness
- [ ] `package.json` — dependency versions, no vulnerabilities
- [ ] SEO: OG tags, meta descriptions, structured data
- [ ] Accessibility: proper aria labels, keyboard navigation

| File | Reviewed | Iteration | Notes |
|------|----------|-----------|-------|
| `README.md` | [ ] | — | Known stale: Next.js version, file structure |
| `pages/index.tsx` | [ ] | — | |
| `pages/privacy.tsx` | [ ] | — | |
| `pages/terms.tsx` | [ ] | — | |
| `pages/gallery.tsx` | [ ] | — | |
| `pages/marketing-assets.tsx` | [ ] | — | |
| `pages/technical.tsx` | [ ] | — | |
| `pages/guide/[slug].tsx` | [ ] | — | |
| `pages/guide/index.tsx` | [ ] | — | |
| `components/*` | [ ] | — | 14 component files |
| `lib/guide/*` | [ ] | — | Search index, config |
| `styles/globals.css` | [ ] | — | |
| `next.config.mjs` | [ ] | — | |
| `package.json` | [ ] | — | Next 16.0.10 pinned (main app: ^16.1.6) |

---

### 4. Marketing Site Stale Doc Copies (MEDIUM PRIORITY)

**Location**: `site/pages/docs/` (~80 markdown files)
**Why**: These are committed copies of `../docs/` that are now stale (pre-fix versions). The `copy-docs.js` prebuild script regenerates them, but having stale copies in git is confusing.
**What to check**:
- [ ] Should `site/pages/docs/` be added to `site/.gitignore`?
- [ ] Does `copy-docs.js` exclude correct directories (currently excludes `08-archived`)
- [ ] Should it also exclude `11-blueprint`?
- [ ] Verify prebuild copies correctly on `npm run build`

---

### 5. Build Blueprint (`docs/11-blueprint/`) (MEDIUM PRIORITY)

**Location**: `docs/11-blueprint/` — 18 markdown files + 6 HTML mockups
**Why**: AI-agent-oriented build guide for replicating this architecture. Created Feb 14, 2026. If inaccurate, agents will build wrong things.
**What to check**:
- [ ] Architecture descriptions match actual codebase
- [ ] File paths and interface references are current
- [ ] Build sequence reflects actual setup
- [ ] Data model sketch matches actual schema
- [ ] State/hooks descriptions match actual implementations
- [ ] Testing playbook matches actual test infrastructure
- [ ] Gotchas section is accurate

| File | Reviewed | Iteration | Notes |
|------|----------|-----------|-------|
| `README.md` | [ ] | — | |
| `01-build-sequence.md` | [ ] | — | |
| `02-decisions.md` | [ ] | — | |
| `03-configurations.md` | [ ] | — | |
| `04-core-interfaces.md` | [ ] | — | |
| `05-data-layer.md` | [ ] | — | |
| `06-state-and-hooks.md` | [ ] | — | |
| `07-auth-and-providers.md` | [ ] | — | |
| `08-supabase-playbook.md` | [ ] | — | |
| `09-sync-engine.md` | [ ] | — | |
| `10-pwa-playbook.md` | [ ] | — | |
| `11-ui-patterns.md` | [ ] | — | |
| `12-i18n.md` | [ ] | — | |
| `13-testing-playbook.md` | [ ] | — | |
| `14-error-handling.md` | [ ] | — | |
| `15-build-and-deploy.md` | [ ] | — | |
| `16-gotchas.md` | [ ] | — | |
| `17-data-model-sketch.md` | [ ] | — | |
| `18-app-vision.md` | [ ] | — | |
| `mockups/*.html` (6 files) | [ ] | — | HTML mockups for practice planner |

---

### 6. Marketing Assets — Generated Materials (COMPLETE)

**Location**: `site/pages/marketing-assets.tsx` (3360 lines), translation JSONs, supporting components
**Scope**: All JSX-generated downloadable marketing materials (LinkedIn, Twitter, Facebook, Instagram, Play Store, YouTube, Cards, Logos, Heroes)

| Round | Action | Result |
|-------|--------|--------|
| R1 | 8-agent Opus 4.6 review | ~50 findings (hardcoded EN, stale stats, CSS bugs, i18n gaps, naming, dead files) |
| R1 Fix | 5-agent parallel fix | All code-level issues fixed |
| R1 Revert | Manual | Assessment screenshot swap reverted (filenames mislabeled, original code correct) |
| R2 | Visual/compositional analysis | 12 issues: alignment, layout, hardcoded labels, YouTube banner |
| R2 Fix | 18 parallel edits | All fixed |

Key fixes:
- **30+ hardcoded English strings** → `t()` i18n calls across all asset sections
- **9 remaining hardcoded labels** (PS V7 phone labels, tech card suffixes) → translated
- **LinkedIn Personal vertical alignment**: 10 banners fixed (`self-start pt-8` → `self-center`)
- **li-1b layout**: removed hardcoded `marginLeft: 330`, proper `justify-between` layout
- **YouTube banner**: enhanced from text-only to logo + title + tagline + URL within safe zone
- **Tech stats updated**: 272K lines, 4700+ tests, 90K docs, 148 components
- **Futsal inclusion**: 5 translation keys updated in both EN and FI
- **CSS fix**: invalid `gap-[-20px]` → `gap-0`
- **Play Store V6/V7 overlap**: tagline moved from `bottom-4` to `bottom-10`
- **PromoVideo.tsx**: "drag-and-drop" → "Interactive"
- **PhoneMockup.tsx**: added `alt` prop for accessibility
- **`.gitignore`**: added `/public/testdata/`

**Not reviewed** (raw asset files — separate concern):
- `site/public/screenshots/` naming inconsistencies (`MatcOps` vs `MatchOps`)
- `site/public/screenshots/archive/`, `misc/` cleanup
- `site/public/gamedata/` and `testdata/` in git

**Status**: COMPLETE. Generated marketing materials reviewed and fixed. Raw screenshot file cleanup deferred.

---

### 7. Main App i18n Translations (LOW PRIORITY)

**Location**: `src/locales/` (main app translation files)
**Why**: Already covered in code review rounds for structural correctness, but not reviewed for translation accuracy/completeness.
**What to check**:
- [ ] All UI strings have both EN and FI translations
- [ ] No missing translation keys
- [ ] Finnish translations are natural and grammatically correct
- [ ] Error messages are user-friendly in both languages

---

### 8. Remotion Video Promo (LOW PRIORITY)

**Location**: `site/remotion/` — 3 files (PromoVideo.tsx, Root.tsx, index.ts)
**Why**: Video promo generation. Minor priority but should work if needed.
**What to check**:
- [ ] Does `npm run video:preview` work?
- [ ] Does the generated video reflect current app?
- [ ] Screenshot references are valid

---

## Review Process

Each review item follows this process:

1. **Initial review**: Multi-agent review identifying all issues
2. **Fix pass**: Apply fixes to all found issues
3. **Verification**: Re-review to confirm fixes and catch anything missed
4. **Mark complete**: Update status in this document

For items requiring multiple iterations, track in the "Iteration" column (e.g., "R1: 12 issues found, R2: 2 remaining, R3: converged").
