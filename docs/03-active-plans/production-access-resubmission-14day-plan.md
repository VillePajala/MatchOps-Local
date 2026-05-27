# Production Access Resubmission: 14-Day Plan

**Created**: 2026-05-24
**Deadline**: 2026-06-07 (14 days from testing restart)
**Testing provider**: TestersCommunity (re-testing round, personal oversight confirmed)
**Goal**: Pass Google Play production access review on second attempt

---

## Why We Were Declined

Google cited:
1. Testers were not engaged with the app during closed test
2. Testing best practices not followed (feedback gathering and acting on it)

Our analysis found a third root cause:
3. Production access form answers overclaimed work that was not done (dynamic walkthrough, native components, etc.)

---

## Strategy

1. Ship 3 real app updates during the 14-day testing window
2. Fix real issues from Sentry error monitoring
3. Improve onboarding, store listing, and screenshots based on tester report
4. Rewrite production access form answers to accurately reflect completed work
5. Each update goes to the **closed testing track** in Play Console so testers get new versions

---

## Day-by-Day Schedule

### Days 1-2 (May 24-25): Prep + ASO Copy

**Goal**: Finalize store listing improvements and prepare Update 1.

Tasks:
- [ ] Rewrite English Play Store description with coaching-focused ASO keywords
  - File: `docs/07-business/store-listing/store-description-en.md`
  - Target keywords: soccer coach app, futsal coach, match timer, lineup planner, substitution tracker, player minutes, tactics board, youth soccer coaching, team roster manager
  - Keep under 4,000 characters, short description under 80 characters
- [ ] Add Finnish Play Store listing copy
  - New section or file: `docs/07-business/store-listing/store-description-fi.md`
  - Keywords: jalkapallo, futsal, valmennus, kokoonpano, peliaika, vaihdot, tilastot
- [ ] Review and fix any claims that don't match actual features (e.g., "unlimited" anything)
- [ ] Align `src/app/layout.tsx` metadata description with store listing
- [ ] Update store listing checklist: `docs/07-business/store-listing/README.md`

### Days 3-4 (May 26-27): Screenshots + Update 1 Release

**Goal**: Create feature-focused screenshots and ship Update 1 to closed testing.

Tasks:
- [ ] Create 6-8 annotated Play Store screenshots with sample data showing:
  1. Match tracking field: "Track the match live"
  2. Lineup and roster: "Set your team in seconds"
  3. Substitutions/minutes: "Manage player time"
  4. Tactics board: "Plan and adjust positions"
  5. Goals/events: "Log key moments"
  6. Player stats: "Review performance after the match"
  7. Seasons/tournaments: "Organize your season"
  8. Offline/local-first: "Works at the field, even offline"
- [ ] Save to `public/screenshots/play-store/`
- [ ] Upload new screenshots and listing copy to Play Console
- [ ] **RELEASE Update 1** to closed testing track in Play Console
  - Content: ASO improvements, screenshot refresh, metadata alignment

### Days 5-7 (May 28-30): Sentry Fixes + Onboarding Polish

**Goal**: Fix real production errors and improve first-run experience.

Sentry issues to investigate:
- [ ] **MATCHOPS-LOCAL-3**: Hydration Error (65 events, recurring since Oct 2025)
  - URL: https://ville-pajala.sentry.io/issues/MATCHOPS-LOCAL-3
  - Even though marked resolved, 65 events suggests it recurs
  - Investigate root cause, apply proper fix
- [ ] **MATCHOPS-LOCAL-8K**: NotFoundError removeChild (41 events)
  - URL: https://ville-pajala.sentry.io/issues/MATCHOPS-LOCAL-8K
  - Likely React DOM cleanup issue; investigate and fix

Onboarding improvements:
- [ ] Audit current onboarding flow: WelcomeScreen, StartScreen, FieldContainer first-game overlay
- [ ] Improve first-game overlay to be more helpful (clearer CTA, better guidance text)
- [ ] Ensure `hasSeenAppGuide` persists properly across reloads
- [ ] Update `docs/04-features/first-game-onboarding.md` to match actual behavior
- [ ] Update English and Finnish translation keys for any new/changed guidance text

### Days 8-9 (May 31 - Jun 1): Update 2 Release

**Goal**: Ship Sentry fixes and onboarding improvements.

Tasks:
- [ ] Verify all Sentry fixes with local testing
- [ ] Verify onboarding flow end-to-end
- [ ] **RELEASE Update 2** to closed testing track
  - Content: Bug fixes (hydration error, DOM cleanup), onboarding improvements
- [ ] Verify TWA packaging and asset links are correct
  - Confirm app opens without browser chrome
  - Confirm `public/.well-known/assetlinks.json` matches production signing certificate

### Days 10-11 (Jun 2-3): Respond to Tester Feedback

**Goal**: Act on any feedback from TestersCommunity testers during this round.

Tasks:
- [ ] Check for new Sentry errors from tester activity
- [ ] Review any feedback from TestersCommunity dashboard
- [ ] Fix at least 1-2 issues reported or observed during this testing round
- [ ] Small polish items: loading states, error messages, edge cases
- [ ] Any quick wins from the tester-feedback-roadmap P1 items

### Days 12-13 (Jun 4-5): Update 3 + Form Prep

**Goal**: Ship final update and prepare production access form answers.

Tasks:
- [ ] **RELEASE Update 3** to closed testing track
  - Content: Tester feedback fixes, polish
- [ ] Write production access form answers (3 parts):

**Part 1 — About Your Closed Test:**
- [ ] Describe tester recruitment honestly: paid testing service + community outreach
- [ ] Describe engagement: testers used core features (match creation, timer, lineup, stats)
- [ ] Describe feedback collection: tester reports, Sentry error monitoring, in-app analytics

**Part 2 — About Your App:**
- [ ] Intended audience: soccer and futsal coaches (youth, grassroots, club level)
- [ ] Value proposition: offline-first match-day assistant for lineup, timer, stats, tactics
- [ ] Expected first-year installs: select realistic range

**Part 3 — Production Readiness (CRITICAL — do not overclaim):**
- [ ] List ONLY changes actually completed during this testing round
- [ ] Example wording: "Based on tester feedback and production error monitoring, we: (1) fixed recurring hydration and DOM errors identified via Sentry, (2) improved the Play Store listing with coaching-specific keywords in English and Finnish, (3) updated screenshots to showcase match tracking, lineup planning, and statistics features, (4) improved first-run guidance for new users. The app runs as a verified TWA with offline-first architecture."
- [ ] Do NOT mention native components, dynamic walkthrough, or anything not done

### Day 14 (Jun 6-7): Submit

**Goal**: Submit production access request.

Tasks:
- [ ] Final check: all 3 updates visible in Play Console release history
- [ ] Final check: 12+ testers still opted in (confirm with TestersCommunity)
- [ ] Final check: Sentry shows no new critical errors
- [ ] Paste finalized form answers into Play Console
- [ ] **SUBMIT** production access request
- [ ] Expect ~7 day review period

---

## Files to Touch

| Phase | Key Files |
|-------|-----------|
| ASO | `docs/07-business/store-listing/store-description-en.md`, `store-description-fi.md`, `README.md`, `src/app/layout.tsx`, `scripts/generate-manifest.mjs` |
| Screenshots | `public/screenshots/play-store/`, `scripts/take-screenshots.mjs` |
| Sentry fixes | Depends on investigation — likely `src/app/layout.tsx`, component files |
| Onboarding | `src/components/WelcomeScreen.tsx`, `StartScreen.tsx`, `FieldContainer.tsx`, `InstructionsModal.tsx`, `src/utils/appSettings.ts` |
| Form answers | New section in this doc or separate `docs/07-business/production-access-answers.md` |

---

## Success Criteria

- [ ] 3 updates shipped to closed testing track during the 14-day window
- [ ] Sentry production errors addressed (hydration + removeChild)
- [ ] Store listing improved with ASO keywords (EN + FI)
- [ ] Screenshots show real features, not empty states
- [ ] Form answers accurately describe only completed work
- [ ] 12+ testers remained opted in for full 14 days
- [ ] No new critical Sentry errors during testing window

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Testers don't engage again | TestersCommunity committed to personal oversight + fresh testers |
| Form overclaims again | Part 3 answers written AFTER completing work, not before |
| New bugs from updates | Each update is small and focused; test locally before release |
| Sentry fixes introduce regressions | Run existing test suite before each release |
| Second decline | TestersCommunity offers 2x refund; can try PrimeTestLab as fallback |

---

## Progress Log

### Completed (May 24-25)
- [x] Cloud gate disabled on master — testers can use local mode without signup
- [x] AAB 1.0.5 (version code 9) built and published to closed testing
- [x] Short descriptions updated in Play Console (EN + FI)
- [x] Fixed signup claim in full descriptions (EN + FI)
- [x] TestersCommunity notified about cloud gate issue
- [x] AGENTS.md synced with CLAUDE.md
- [x] Sentry cleaned: 5 IndexedDB issues ignored (developer testing, Edge private mode)
- [x] Sentry: removeChild error ignored (React 19 framework issue, not app code)
- [x] Sentry: Hydration error already fixed (commit 75c45373, May 10)

### Sentry Issue Disposition
| Issue | Events | Status | Action |
|-------|--------|--------|--------|
| MATCHOPS-LOCAL-3 | 65 | Resolved | Fixed May 10 (i18n hydration mismatch). Monitor for recurrence. |
| MATCHOPS-LOCAL-8K | 47 | Ignored | React 19 removeChild — framework bug, no app-level fix. |
| MATCHOPS-LOCAL-8P/Q/R/S/T | 1-2 each | Ignored | Developer testing from Edge with IndexedDB blocked. |

### Release Notes for Next AAB (1.0.6, ~June 4-5)
English:
```
- Disabled cloud login requirement — app now starts instantly
- Fixed hydration error on entry screens
- Monitoring and error reporting improvements
- [add any additional fixes done before next AAB]
```

Finnish:
```
- Kirjautumisvaatimus poistettu — sovellus käynnistyy heti
- Aloitusnäyttöjen näyttövirhe korjattu
- Seuranta- ja virheraportoinnin parannuksia
- [lisää mahdolliset muut korjaukset ennen seuraavaa AAB:tä]
```

---

## Reference Documents

- [Tester feedback analysis](../10-analysis/tester-feedback-analysis-2026-05-19.md)
- [Tester feedback roadmap](./tester-feedback-roadmap.md)
- [Google Play testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Master execution guide](./master-execution-guide.md)
