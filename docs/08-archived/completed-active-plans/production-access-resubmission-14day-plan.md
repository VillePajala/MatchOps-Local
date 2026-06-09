# Production Access Resubmission Plan

**Created**: 2026-05-27  
**Updated**: 2026-06-07  
**Scope**: Next closed-testing AAB and Google Play production-access request  
**Target branch**: `release/aab-1.0.6` (merged via PR #420; later fixes on `master`)

---

## Current Status (2026-06-07)

- **Production access to be submitted 2026-06-08** (day 14 of the closed-testing window).
- **Three waves of changes shipped to the closed-testing track during the test** (this is
  the "actively iterating on testing" evidence; version codes ran higher than the wave count
  because of duplicate-code re-uploads — codes 12/13 were re-numbered builds of 1.0.7, not new content):
  1. **Start of test** — removed forced cloud signup so the app is usable instantly in offline
     local mode (`4ba30ac1`); reduced error-monitoring noise (`e7c242aa`).
  2. **1.0.6 / code 11** (2026-05-31) — timer hidden-pause double-count fix (`46cac499`);
     match-date preservation fix (`e13c7f45`, `36f8f5ab`); copyable app-info for feedback (`8aa192af`).
  3. **1.0.7 / code 14** (2026-06-07) — "How It Works" in-app guide link on the start screen (`a88084e8`).
- **Currently active build**: `1.0.7 / code 14` (replaced `1.0.6 / code 11`, now deactivated).
- **Tester recruitment + feedback via Testers Community (paid provider)**, for two purposes:
  meeting Google's closed-testing bar (12+ testers, 14 continuous days) and gathering feedback.
- **App type reminder**: TWA (webview wrapper of the PWA), **not native**. Never claim native components.

**Next action**: submit production access using the final answers below (see "Production-Access
Answers — Final"), then complete the manual TWA verification checklist.

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
- In-app feedback path improved and verified: Settings includes a friendly "Send Feedback" email action plus a "Copy app info" action for version, language, mode, display mode, platform, and browser details. No game, roster, or player data is attached or copied automatically.
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

## Production-Access Answers — Final

Verified against the codebase, git history, and Play Console testing history (2026-06-07).
No claims that cannot be substantiated. Paste-ready copy: `com.matchops.local_production_ANSWERS.txt`
on the developer's desktop (keep both in sync).

**Verifiable facts these rely on:** internal testing since 10 Dec 2025; closed testing since
9 Feb 2026 (codes 1→7→9→11→14); recent releases 1.0.5 (26 May), 1.0.6 (1 Jun), 1.0.7 (7 Jun);
~97 changes during closed testing (63 fixes, 17 features); the Android app is a TWA (web deploys
reach testers live) — **never claim native components**.

**Engagement framing:** we deliberately do NOT cite the Play Console "active testers" count (it
reflects accounts enrolled via the paid provider, not genuine engagement). Engagement is described
qualitatively — small engaged core + intensive first-hand testing + provider to broaden coverage.

**1) How did you recruit testers?**
> We recruited testers through a paid closed-testing provider, supplemented by outreach within our target audience of grassroots soccer and futsal coaches. Our goal was to get the app in front of people who run real match days, not only to meet the tester count.

**2) How easy was it to recruit testers?** — Easy

**3) Describe the engagement from testers.**
> The app has been in testing on Google Play since December 2025 — first internal testing, then closed testing. For most of that time we hardened it through intensive first-hand testing and a small group of engaged testers, and we recently used a paid testing provider to broaden coverage. Testers exercised the core match-day flows — setting lineups, the live timer, event logging, and stats. Because the Android app is a Trusted Web Activity, improvements reach installed testers immediately, so we iterated continuously rather than waiting for store releases — shipping close to 100 updates over the test, rolled into three recent store releases (1.0.5, 1.0.6, 1.0.7). No blocking crashes or core failures were reported.

**4) Summary of feedback + how collected.**
> Feedback was gathered through an in-app feedback action in Settings (which lets a tester send an email with a one-tap copy of app version, language, and device details — with no game, roster, or player data attached) and through direct communication with our engaged testers. The main themes were that new users wanted the in-app guide to be easier to find, and a couple of small interaction bugs in the timer and game-settings screens. We addressed all of these during testing (see Q8). No data-loss or crash issues were reported.

**5) Intended audience.**
> MatchOps is built for soccer and futsal coaches, from youth and grassroots teams to competitive amateur leagues. It is bilingual (English and Finnish) and includes Finnish league and series presets, reflecting our initial focus on coaches in Finland.

**6) How the app provides value.**
> MatchOps brings a coach's match-day workflow into one tool: plan lineups from a shared player pool, track the game live on an interactive field with a period timer and substitution alerts, log goals, assists and notes, and automatically build per-player statistics and assessments. It is local-first — it works fully offline with no account required, keeping data on the coach's device — with optional cloud sync for coaches who want their data across devices. The app has been refined over roughly six months of active development and testing across Google Play's internal and closed tracks.

**7) Expected installs in year one** — 1,000 – 10,000

**8) What changes did you make based on the closed test?**
> Throughout the closed test we treated the app as a living product, shipping close to 100 updates (predominantly bug fixes). Because the Android app is a Trusted Web Activity these reached testers continuously, and were rolled up into the store releases we published after the previous review (1.0.5, 1.0.6, 1.0.7, late May to early June). The work spanned: cloud sync and offline resilience (background sync engine circuit breaker, recovery on app resume, no infinite retries on expired auth, grace-period handling); data integrity in game setup and statistics (match date/time handling during roster edits, more robust auto-save, correct external-adjustment stats); stability and error-noise reduction (filtering transient network and service-worker noise from monitoring, fixing a server-render hydration issue on entry screens); and onboarding and feedback (a "How It Works" entry on the start screen, a one-tap "copy app info" action, and a clearer notification system). We also removed a barrier that had forced Play Store testers to create a cloud account, so the app is now usable instantly in offline local mode. The specific issues testers surfaced — onboarding discoverability, a timer that could double-count after backgrounding, and a match date reset during roster edits — were all addressed in these releases.

**9) How did you decide the app is ready for production?**
> Readiness is enforced by an automated quality process rather than a one-time judgement. The app has been tested on Google Play since December 2025 — through internal and then closed testing — and refined through close to 100 updates during that period, the large majority of them bug fixes. The core match-day flows have run without blocking issues, and the local-first design means a coach's data stays on their device by default. The codebase is covered by 220+ automated test suites spanning core workflows, accessibility, and performance, and every change must pass continuous-integration gates (type-checking, linting, the test suite, a production build, and a dependency audit) before it ships. Production errors are monitored with Sentry, configured to scrub personal data. On that basis we consider the app stable and ready for a wider audience.

**10) What did you do differently this time?**
> The previous round stalled on low engagement, partly because testers were pushed into account creation before they could try the app. This time we removed that barrier, then iterated visibly — close to 100 updates rolled into three store releases over the window — fixing the specific issues testers surfaced and making the in-app guidance and feedback path easier to reach. The emphasis was on reducing friction and acting on testing, not adding features.

### Consistency (all answers tell one story)
- **Scale of change** identical across Q3 / Q8 / Q9 / Q10: "close to 100 updates, rolled into three releases (1.0.5–1.0.7)".
- **Engagement** identical across Q1 / Q3 / Q4 / Q9: small engaged core + intensive first-hand testing + provider to broaden; no "active testers" count claimed.
- **Timeline** identical across Q3 / Q6 / Q9: testing since Dec 2025, ~6 months.
- **Feedback themes** in Q4 map exactly to the changes in Q8.

### Verify before submitting
- **Q1**: Only keep "supplemented by outreach…" if you actually contacted coaches directly; otherwise cut that clause.
- **Q4/Q8**: Do **not** claim ASO/description or screenshot changes unless you actually made them in Play Console.
- **Q7**: Adjust the install range if you prefer a different figure.
- **Q8 honesty line**: the ~100 updates are continuous hardening (mostly your own QA); only the named items were tester-surfaced. Do not claim all were tester-requested.
- **Do not** cite the "80 active testers" console figure — it counts provider enrolments, not genuine engagement.
- **Never** claim "native components" — the app is a TWA (webview wrapper).

### Submitted form answers (Finnish, ≤300 chars/field)
The actual values entered in the Play Console form. Keep in sync with the English answers above.

- **K1 — Miten sait käyttäjiä suljettuun testiin?** [260]
  > Rekrytoin testaajia TestersCommunityn kautta sekä omasta verkostostani, johon kuului myös oikeita juniorijalkapallovalmentajia. Testaajat liittyivät Google Playn suljettuun testiin opt-in-linkillä ja testasivat sovellusta Android-laitteilla testijakson aikana.
- **K2 — Kuinka helppoa rekrytointi oli?** Helppoa
- **K3 — Kuvaile testaajien käytöstä suljetun testin aikana.** [279]
  > Testaajat kokeilivat päätoimintoja: ottelun seurantaa, kokoonpanoja, vaihtoja ja tilastoja. Käyttö vastasi pääosin valmentajan pelipäiväkäyttöä. Kaikkia ominaisuuksia (esim. taktiikkataulu, pelaaja-arviot) ei käytetty yhtä kattavasti, ja testijakso oli lyhyempi kuin oikea kausi.
- **K4 — Yhteenveto palautteesta + miten kerätty.** [282]
  > Palautetta kerättiin TestersCommunity-raporteista, palautetoiminnosta ja Sentrystä. Testaajat eivät raportoineet kriittisiä virheitä. Palaute, virheseuranta ja oma testaus johtivat lähes sataan korjaukseen testin aikana, ja palaute ohjasi erityisesti onboardingia ja käytettävyyttä.
- **K5–K10**: condense the English answers above to ≤300 chars as the form requests each.

---

## Next AAB Scope Linkage

This document covers the production-access evidence workstream only. The implementation work should be tracked in the next release checklist:

1. Play Store listing/screenshot verification against the assets already uploaded in Play Console.
2. Existing first-run guidance verification.
3. Improved in-app feedback entry point verification.
4. Verification: `npm run lint`, `npm test`, `npm run build`, Android/TWA smoke test.
