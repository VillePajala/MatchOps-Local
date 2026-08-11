# Play Store release — MatchOps 1.0.8 (versionCode 18)

**Why this upload:** Play compliance (deadline **2026-08-31**) — the new AAB targets **API 35** (Android 15) and removes the deprecated **Play Billing** library. Both warnings clear with this build.

**Baseline:** last uploaded binary was **1.0.7 (code 14, built 2026-06-07)**. Everything below reached users automatically via the web app the TWA wraps; the store notes just summarize the highlights.

---

## Play Console "What's new" — paste into the release (≤500 chars per language)

### English
```
Lots of new features (most already reached you via the web app):
• Playing-Time Planner – plan subs & rotations across a tournament and keep everyone's minutes fair
• New Home screen: resume game, season record, recent results & top scorer at a glance
• Tabbed navigation: Games / Club / Competitions / Stats
• Player development trends & a shareable report
• Positions played & position balance
• One-tap match recap and match report
• Overtime & penalty shootouts
• Friendlies kept out of competitive stats
• Many fixes
```

### Suomi
```
Paljon uutta (suurin osa jo käytössäsi verkkosovelluksen kautta):
• Peliaikasuunnittelija – suunnittele vaihdot ja rotaatiot koko turnaukseen ja pidä peliaika tasaisena
• Uusi alkunäkymä: jatka-peli, kauden tulokset, viimeisimmät ottelut ja maalintekijä yhdellä silmäyksellä
• Välilehdet: Pelit / Seura / Kaudet / Tilastot
• Pelaajan kehitystrendit ja jaettava raportti
• Toteutuneet pelipaikat ja pelipaikkajakauma
• Ottelukooste ja otteluraportti
• Jatkoaika ja rangaistuslaukaukset
• Harjoitusottelut erillään kilpailutilastoista
• Lukuisia korjauksia
```

---

## Full changelog since 1.0.7 (for reference / store-description update)

**Planning & fairness**
- **Playing-Time Planner** — plan starting lineups and substitutions across a whole tournament at once, with per-game availability, "suggest fair lineups", running playing-time totals, and live sub reminders during the match. Cloud-synced.

**App structure**
- **Two-level app** — the Home screen is now a club hub with tabbed navigation (Games / Club / Competitions / Stats) and the field is a focused match view.
- **Home dashboard** — opens to a snapshot: the game to resume, your season record, recent results, and top scorer.

**Player development**
- **Development notes & trends** — record short observations after a game; strengths, growing areas, and direction build over time, with a shareable summary (compare to the player's own past).
- **Positions played & position balance** — record where each player actually played; see the per-player breakdown by line and by position across a season.

**Match day**
- **Overtime & penalty shootouts** — record extra time and shootouts; the result flows into stats.
- **One-tap match recap** — a ready-to-share summary (score, scorers, assists, lineup, match report).
- **Match report** — a guided template for your post-game write-up, included in the recap.
- **Friendly matches** — track practice games without skewing your competitive stats.
- **Finish-this-game checklist** — a nudge to complete a game's record (report, roster, positions).

**Quality of life**
- Undo toast after logging a goal/sub, "repeat last game" quick setup, and numerous fixes and polish.

---

## Upload checklist
1. Build: `bubblewrap build` in `~/projects/Archive/matchops-twa/` → signed AAB (v1.0.8 / code 18, targetSdk 35, no billing). Note: codes 16 and 17 were consumed by earlier upload attempts; each Play upload needs a fresh, higher versionCode.
2. Play Console → Production (or a test track) → create release → upload the AAB.
3. Paste the "What's new" text above (EN + FI).
4. Confirm the two Play warnings (target API, Play Billing) clear after review.
