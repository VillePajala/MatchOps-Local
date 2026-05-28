# Production Access Resubmission Plan

**Created**: 2026-05-27  
**Scope**: Next closed-testing AAB and Google Play production-access request  
**Target branch**: `release/aab-1.0.6`

---

## Goal

Prepare a factual production-access resubmission after closed testing. The previous rejection cited low tester engagement and insufficient evidence that feedback was gathered and acted on. This plan keeps the next AAB focused on visible tester-feedback follow-up and accurate Play Console answers.

## Ground Rules

- Do not claim work that has not shipped.
- Do not claim a native rewrite or native UI migration.
- Describe MatchOps accurately as a local-first PWA distributed on Android as a verified Trusted Web Activity (TWA).
- Keep planner, billing enforcement, and native rewrite work out of this AAB unless explicitly re-scoped.

---

## Evidence To Include In Play Console Answers

### Closed Test Follow-Up

Use completed work only. Candidate points once shipped or verified:

- Store listing copy reviewed and confirmed to already be coach-focused and accurate.
- Existing Play Store screenshots reviewed and confirmed to already show the app workflows.
- Existing first-run guidance reviewed and confirmed: welcome/start screens, first-game field overlay, help modal, and guide reset path are already present.
- Existing in-app feedback entry point reviewed and confirmed: Settings includes a "Send Feedback" email action.
- Sentry checked before submission; as of 2026-05-27 manual dashboard review showed no current tickets.

### Packaging Statement

Use this wording pattern:

> MatchOps is a local-first Progressive Web App packaged for Android as a Trusted Web Activity. The app uses Digital Asset Links to verify ownership of the web origin and runs fullscreen without browser chrome when installed from Google Play. We are not claiming a native rewrite for this release.

### Do Not Say

- "We transitioned to native components."
- "We rebuilt the app natively."
- "We completed a dynamic walkthrough" unless the first-run checklist is actually shipped.
- "We fixed Sentry issues" unless there were current unresolved issues and code changes were shipped.

---

## TWA Verification Checklist

Repository-side evidence:

- [x] `public/.well-known/assetlinks.json` exists.
- [x] `assetlinks.json` declares package `com.matchops.local`.
- [x] `assetlinks.json` contains concrete SHA-256 fingerprints, not placeholders.
- [x] TWA build documentation exists in `docs/05-development/twa-build-guide.md`.
- [x] Previous project documentation records TWA fullscreen verification.

Manual Play-build verification before submission:

- [ ] Install the current closed-testing build from Google Play.
- [ ] Confirm the app opens fullscreen without browser address bar/chrome.
- [ ] Confirm package name in Play Console is `com.matchops.local`.
- [ ] Confirm Digital Asset Links verification passes for the production domain and Play App Signing certificate.

If any manual verification fails, do not submit production access. Fix the TWA package or asset links first.

---

## Draft Production-Access Answer Points

### What Feedback Was Received?

Testers did not report blocking crashes or broken core functionality. Some report text questioned the store listing, screenshot quality, onboarding, and feedback collection, but manual review indicates the app already has strong descriptions, roughly ten Play Store screenshots, first-run guidance through the welcome/start screens, first-game field overlay, and help modal, plus a Settings feedback email action. Treat those as evidence to reference, not as required rebuilds. The remaining launch-readiness focus is accurate Android packaging wording and final verification.

### What Changed Based On Feedback?

Final answer should list only shipped changes. Use this template after the AAB is built:

> Based on tester feedback and our own review, we verified that the Play Store listing, screenshots, first-run guidance, and in-app feedback path already describe and support the product accurately. We also reviewed production error monitoring before submission; Sentry showed no current tickets at the time of review.

### How Is The App Ready For Production?

> MatchOps has been tested as a local-first coaching app for soccer and futsal match-day workflows: creating games, managing lineups, tracking the timer, logging events, and reviewing stats. The Android app is distributed as a verified TWA, with Digital Asset Links configured for package `com.matchops.local`. The app works offline by default and does not require account creation for local use.

---

## Next AAB Scope Linkage

This document covers the production-access evidence workstream only. The implementation work should be tracked in the next release checklist:

1. Play Store listing/screenshot verification against the assets already uploaded in Play Console.
2. Existing first-run guidance verification.
3. Existing in-app feedback entry point verification.
4. Verification: `npm run lint`, `npm test`, `npm run build`, Android/TWA smoke test.
