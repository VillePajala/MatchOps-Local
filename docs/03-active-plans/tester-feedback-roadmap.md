# Tester Feedback Roadmap

**Created**: 2026-05-19  
**Source Analysis**: [tester-feedback-analysis-2026-05-19.md](../10-analysis/tester-feedback-analysis-2026-05-19.md)  
**Purpose**: Turn closed-test feedback into concrete release work for Play Store production readiness.

---

## Release Principle

The tester reports did not identify blocking crashes or critical app bugs. Treat this roadmap as launch-readiness work:

- improve Play Store conversion,
- make first-session onboarding clearer,
- verify Android packaging quality,
- avoid overclaiming in Play Console production access answers.

Do not start a native rewrite from this report alone. First verify whether the Android app is packaged as a proper Trusted Web Activity. If TWA verification passes and performance is acceptable, keep the PWA/TWA architecture for v1.

---

## Priority Summary

| Priority | Workstream | Target | Why |
|----------|------------|--------|-----|
| P0 | Production questionnaire cleanup | Before production access form | Prevent inaccurate claims |
| P0 | TWA/package verification | Before production access form | Clarify WebView/native concern |
| P0 | Store listing ASO pass | Before production access form | Directly addresses tester feedback |
| P1 | Feature-focused screenshots | Before public launch | Improves Play Store conversion |
| P1 | Guided first-match onboarding | Before or shortly after production review | Improves activation and retention |
| P1 | In-app feedback entry point | Before public launch | Supports post-launch learning |
| P2 | Release notes/update notification | After P1 or bundled if cheap | Keeps users informed |
| P2 | Extra locales/tablet assets | After launch data | Expand based on actual markets |

---

## Phase 0: Form And Packaging Accuracy

### Goal

Make sure Play Console answers and Android packaging claims match the product as shipped.

### Tasks

1. Rewrite production access questionnaire answers.
   - Replace "we transitioned to native components" with accurate TWA/PWA wording.
   - Replace "we implemented" with "we prioritized" unless the work is complete.
   - Keep the tester recruitment answer factual: paid testing provider plus real coach outreach if that actually happened.

2. Verify Android packaging.
   - Confirm current Play Store artifact is TWA, not a generic WebView wrapper.
   - Confirm app opens without browser address bar.
   - Confirm package name is `com.matchops.local`.
   - Confirm `public/.well-known/assetlinks.json` fingerprints match production signing / Play App Signing.
   - Confirm Digital Asset Links verification succeeds against the production domain.

3. Document packaging decision.
   - Add a short ADR or release note: PWA + verified TWA for v1.
   - Native rewrite deferred unless Play review, performance data, or platform integrations require it.

### Files / Areas

- `docs/10-analysis/tester-feedback-analysis-2026-05-19.md`
- `docs/05-development/twa-build-guide.md`
- `public/.well-known/assetlinks.json`
- Play Console production access form
- Android/TWA build artifact outside this repo, if applicable

### Acceptance Criteria

- Production access answers do not claim incomplete work.
- Installed Android app is verified as TWA or a remediation task is opened.
- Asset links are verified with the actual production certificate.
- Native/WebView concern has a documented v1 decision.

---

## Phase 1: ASO And Store Listing Copy

### Goal

Make the Play Store listing clearer, more searchable, and aligned with actual MatchOps features.

### Tasks

1. Finalize English listing.
   - Short description at or below 80 characters.
   - Full description below 4,000 characters.
   - Include soccer and futsal keywords naturally.
   - Highlight match timer, lineup planning, substitution tracking, player minutes, tactics board, stats, offline/local-first use.

2. Add Finnish listing.
   - Short description at or below 80 characters.
   - Full description below 4,000 characters.
   - Use Finnish coaching terms coaches actually search for: jalkapallo, futsal, valmennus, kokoonpano, peliaika, vaihdot, tilastot.

3. Remove or qualify unsupported claims.
   - Avoid "unlimited" unless production limits are disabled.
   - Align cloud sync and billing wording with the actual release state.
   - Avoid implying a native app rewrite.

4. Align metadata.
   - Review `src/app/layout.tsx` description.
   - Review generated manifest description in `scripts/generate-manifest.mjs`.
   - Keep app name, short name, and description consistent across web/PWA/store.

5. Update store checklist.
   - Mark existing feature graphic and screenshots accurately.
   - Add missing items as follow-up tasks instead of stale unchecked boxes.

### Files / Areas

- `docs/07-business/store-listing/store-description-en.md`
- New `docs/07-business/store-listing/store-description-fi.md`
- `docs/07-business/store-listing/README.md`
- `src/app/layout.tsx`
- `scripts/generate-manifest.mjs`

### Acceptance Criteria

- English and Finnish store copy is ready to paste into Play Console.
- Copy matches actual production functionality and pricing.
- Store listing checklist reflects current asset state.
- Manifest/web metadata does not conflict with Play Store positioning.

---

## Phase 2: Feature-Focused Screenshots

### Goal

Replace generic-looking screenshots with a complete conversion-focused Play Store set.

### Screenshot Set

1. Match tracking field: "Track the match live"
2. Lineup and roster: "Set your team in seconds"
3. Substitutions/minutes: "Manage player time"
4. Tactics board: "Plan and adjust positions"
5. Goals/events: "Log key moments"
6. Player stats: "Review performance after the match"
7. Seasons/tournaments: "Organize your season"
8. Offline/local-first: "Works at the field, even offline"

### Tasks

1. Create deterministic sample data for screenshots.
   - Use realistic team/player names.
   - Include soccer and futsal examples if practical.
   - Avoid private real tester or club data.

2. Update screenshot generation.
   - Extend `scripts/take-screenshots.mjs` or add a dedicated Play Store screenshot script.
   - Drive the app into each target view.
   - Use a consistent phone viewport.
   - Optional: create tablet variants later.

3. Add captions/frames.
   - Ensure text is readable at Play Store preview size.
   - Keep captions short and feature-specific.
   - Avoid marketing claims that screenshots do not show.

4. Regenerate and review assets.
   - Save final phone images under `public/screenshots/play-store/`.
   - Keep source/caption workflow documented.

### Files / Areas

- `scripts/take-screenshots.mjs`
- `public/screenshots/play-store/`
- `public/example_data/`
- `docs/07-business/store-listing/README.md`

### Acceptance Criteria

- 6-8 phone screenshots exist at Play Store-compatible dimensions.
- Screenshots use sample data, not empty states.
- Captions are readable and not clipped.
- At least one screenshot communicates offline/local-first value.
- Store listing doc lists the final screenshot order.

---

## Phase 3: Guided First-Match Onboarding

### Goal

Turn the existing onboarding fragments into a coherent first-session workflow.

### Recommended V1 Scope

Use a lightweight guided checklist rather than a heavy multi-step overlay library.

Checklist steps:

1. Add players
2. Create or select team
3. Create match
4. Place lineup
5. Start timer
6. Log goal/event
7. Open stats

### Tasks

1. Audit current onboarding state.
   - `WelcomeScreen.tsx`
   - `StartScreen.tsx`
   - `FieldContainer.tsx`
   - `InstructionsModal.tsx`
   - `src/utils/appSettings.ts`
   - translations under `public/locales/`

2. Define persisted onboarding state.
   - Reuse or extend `hasSeenAppGuide`.
   - Track checklist completion only if useful; otherwise track dismissed/completed.
   - Make reset available in Settings.

3. Build first-match checklist UI.
   - Show on first empty/default game state.
   - Keep it skippable.
   - Route actions to existing modals.
   - Keep it compact on mobile.

4. Add contextual guidance.
   - Highlight only key controls: roster, new match, timer, event log/stats.
   - Avoid blocking live match operation.

5. Update documentation.
   - Make `docs/04-features/first-game-onboarding.md` match actual behavior.

6. Add tests.
   - First-run display.
   - Skip/dismiss persistence.
   - Reset from Settings if implemented.
   - At least one CTA opens the correct modal.
   - English/Finnish translation keys present.

### Files / Areas

- `src/components/WelcomeScreen.tsx`
- `src/components/StartScreen.tsx`
- `src/components/HomePage/containers/FieldContainer.tsx`
- `src/components/InstructionsModal.tsx`
- `src/components/SettingsModal.tsx`
- `src/utils/appSettings.ts`
- `public/locales/en/common.json`
- `public/locales/fi/common.json`
- `docs/04-features/first-game-onboarding.md`

### Acceptance Criteria

- A new user can complete the first-match path without guessing menu locations.
- Guide can be skipped.
- Dismissal/completion survives reload.
- Guide can be reopened or reset from a discoverable place.
- Tests cover the primary behavior.

---

## Phase 4: In-App Feedback Mechanism

### Goal

Give production users a low-friction, privacy-respecting way to send feedback.

### Tasks

1. Add Settings entry: "Send feedback".
2. Add feedback modal.
   - Message textarea.
   - Optional email field if not signed in.
   - Include explicit consent text for diagnostic context.
3. Decide backend route.
   - Option A: `mailto:` link for first release.
   - Option B: Supabase table / edge function.
   - Option C: external form link.
4. Include minimal diagnostic context only after disclosure.
   - app version,
   - language,
   - browser/platform,
   - mode: local/cloud,
   - timestamp.
5. Add tests for modal and submission path.

### Files / Areas

- `src/components/SettingsModal.tsx`
- New feedback component/hook if needed
- translations
- optional Supabase function/table

### Acceptance Criteria

- User can find feedback entry from Settings.
- User sees what context is sent.
- No private roster/game data is sent automatically.
- Submission path works in production build.

---

## Phase 5: Feature Update Notifications

### Goal

Use existing changelog/release notes infrastructure to inform users about updates without interrupting match use.

### Tasks

1. Review current release assets.
   - `public/changelog.json`
   - `public/release-notes.json`
   - `scripts/generate-changelog.mjs`
   - `scripts/generate-release-notes.mjs`
2. Define "new version seen" persistence.
3. Show a small update/release-notes prompt after update.
4. Keep it dismissible.
5. Do not show during active match timer if avoidable.

### Acceptance Criteria

- Users see notable update info once per version.
- Prompt can be dismissed.
- Prompt does not interfere with live tracking.

---

## Phase 6: Post-Launch Expansion

### Goal

Use real launch data before spending time on broader localization or native rewrites.

### Tasks

1. Review Play Console acquisition/search terms.
2. Review support/feedback themes.
3. Add Swedish/Norwegian/Danish only if installs or target clubs justify it.
4. Add tablet screenshot sets if tablet usage is meaningful.
5. Reassess native strategy only if:
   - Play review flags TWA/WebView concerns,
   - performance is poor on target Android devices,
   - billing/platform APIs cannot be handled cleanly,
   - coaches need device integrations unavailable to TWA.

### Acceptance Criteria

- Expansion work is based on real usage or review signals.
- Native rewrite decision has evidence, not just generic tester wording.

---

## Suggested PR Breakdown

### PR 1: Production Access Answer Pack

Scope:
- Add final Play Console questionnaire answers.
- Include before/after wording depending on completed work.
- Link tester analysis.

Risk: low  
Can ship independently: yes

### PR 2: ASO Listing Refresh

Scope:
- English listing rewrite.
- Finnish listing addition.
- Store checklist update.
- Metadata/manifest description alignment if needed.

Risk: low  
Can ship independently: yes

### PR 3: TWA Verification And Decision Note

Scope:
- Verify asset links/package behavior.
- Update TWA guide with actual release notes/fingerprints status.
- Add architecture decision note.

Risk: low-medium because it may expose packaging issues  
Can ship independently: yes

### PR 4: Play Store Screenshot Set

Scope:
- Sample data.
- Screenshot automation updates.
- 6-8 final screenshots.
- Store listing screenshot order.

Risk: medium because screenshot automation can be brittle  
Can ship independently: yes

### PR 5: First-Match Checklist

Scope:
- Persisted onboarding state.
- Checklist UI.
- Modal routing.
- Translation updates.
- Tests.

Risk: medium because it touches first-run UX and app state  
Can ship independently: yes

### PR 6: Feedback Entry Point

Scope:
- Settings feedback item.
- Feedback modal.
- Submission path.
- Privacy disclosure.
- Tests.

Risk: low-medium depending on backend choice  
Can ship independently: yes

### PR 7: Release Notes Prompt

Scope:
- Version-seen persistence.
- Dismissible update prompt.
- Tests.

Risk: low  
Can ship independently: yes

---

## Non-Goals

- No native Android rewrite in this roadmap.
- No broad redesign of the app shell.
- No changes to core match tracking behavior unless needed for onboarding.
- No new community/forum feature inside the app for v1.
- No automatic upload of private team, player, or match data for feedback.

---

## Immediate Next Step

Start with PR 1 and PR 2. They directly support production access and Play Store submission, have the lowest engineering risk, and prevent the main issue found in the production questionnaire: inaccurate claims about work that is only partially done.
