# Go-to-market & marketing video plan

**Status:** active (first-run gate cleared) · **Created:** 2026-07-28
**Goal:** grow users **bit by bit** to battle-test the app and stay ahead of Supabase limits, using video-led introductions in Finnish youth-coaching communities. Not a big-bang launch.

The new-user experience fixes (auto-place squad, skip dead WelcomeScreen, return-to-setup) shipped in #701, so the leaky-bucket first-run that gated this is fixed.

---

## 1. Pre-flight (do before driving any installs)

1. **Upgrade Supabase to Pro ($25/mo) — pre-emptively, not reactively.** The app is local-first so *compute* load per user is modest, but free tier bites on: no backups/PITR (the data-safety backstop gap), 500 MB DB (tight as game data accumulates), and 7-day-inactivity pause. Pro fixes all three (daily backups + PITR, 8 GB, no pause). Flip it before real users trust the app with a season of data. Instant, no migration.
2. **Upload the Play-compliance AAB 1.0.8** (on the desktop) — don't drive installs while blocked from shipping updates. Deadline 2026-08-31 anyway.
3. **Instrument + pre-decide thresholds.** Weekly check of four dashboards, with "widen / upgrade" triggers set in advance:
   - **Supabase** — DB size, MAU, egress. In Phase 1 measure *MB added per active user* to project the ceiling.
   - **Sentry** (already wired) — error rate + new issues = battle-test radar.
   - **Play Console** — installs, crash-free rate, uninstalls, ratings.
   - **Feedback path** — make sure early users can reach us (in-app contact / site) so problems come to us, not to a 1-star.

---

## 2. The drip: channels, gated by stability

Skip the owner's own coach circle (followers, not seeders — they come once there's traction). Seed with *open* coaches from communities.

**Where the audience is (ranked):**
1. **Finnish football coaching Facebook groups** (e.g. "Jalkapallovalmentajat", regional/club coaching groups) — highest density, lowest cost.
2. **Palloliitto coaching courses (kouluttajat)** — new UEFA C / grassroots coaches are tool-hungry and captive.
3. **A development-minded club's valmennuspäällikkö** — one endorsement = a whole club's coaches at once.
4. **Taso-using coaches** — the app already links to Taso; lean on that overlap in the messaging.

**Phased, one channel at a time:**
- **Phase 1 — one group (~5–20 coaches).** Post the hero video once. Convert repliers into the battle-test cohort.
- **Phase 2 — second channel (~20–100).** Only after Phase 1 is stable.
- **Phase 3 — widen (100+).** Add channels one at a time (Palloliitto, more clubs, Play ASO).

**Gate to move to the next phase:** crash-free > ~99% · Supabase comfortably under limits · coaches *returning for a 2nd/3rd game* (retention beats installs). If any wobble, hold and fix.

**How to post so it lands (not spam):** lead with the builder-coach story and the problem, not the product · show the hero video · say the magic words (free, no ads, no account hassle, made by a coach) · ask for feedback not downloads · clear self-promo with the group admin first · reply to every comment in the first 48 h · find one enthusiastic replier and make them a champion.

---

## 3. Video plan

The single highest-leverage asset. Works in the FB post, the store listing, and DMs. FB/IG autoplay **muted**, so: captions on-screen, no voiceover needed (v1).

### 3a. Production toolkit (solves the two known problems)
- **Show taps** (Android): Settings → About phone → tap Build number ×7 → Developer options → enable **"Show taps"** so every tap shows as a dot in the recording. (Skip "Pointer location" — too busy.)
- **Record**: built-in Android screen recorder (swipe down → Screen record). Portrait.
- **Edit**: **CapCut** (free) — trim, on-screen text captions, royalty-free music, optional Finnish text-to-speech if voice is ever wanted.
- **Format**: vertical **9:16**, 1080p. Hero ~30 s; series 10–15 s.
- **Alternative** to phone: record the PWA in a narrow desktop Chrome window (mouse cursor is naturally visible), easier editing — but phone + Show taps is more authentic.

### 3b. HERO video — "One match, start to finish" (~30 s) — MAKE THIS FIRST
Job: answer "what is this and why care" **completely**. Breadth, not depth. Ends on the payoff (recap). First frame matters most (muted autoplay).

| Beat | Time | Show | Finnish caption |
|---|---|---|---|
| 1 Hook | 0–3s | Open app → team already on the field (auto-placed) | **Joukkue valmiina kentälle yhdellä napautuksella** |
| 2 | 3–8s | Start the match timer | **Käynnistä ottelun kello** |
| 3 | 8–15s | Log a goal → tap scorer + assist | **Kirjaa maalit ja syöttäjät hetkessä** |
| 4 | 15–20s | A quick substitution / playing time | **Seuraa vaihtoja ja peliaikaa** |
| 5 Payoff | 20–27s | Open the match recap / stats | **Valmis ottelukooste heti pelin jälkeen** |
| 6 End card | 27–30s | App name + logo + store badge | **MatchOps – ilmainen valmennussovellus · Lataa Google Playsta** |

Recording steps: (1) enter the demo game (§3d), (2) pre-log 3–4 goals off-camera so the recap looks substantial, (3) hit record, (4) walk beats 1–5 deliberately and slowly (log ONE more goal live in beat 3), (5) stop. Import to CapCut, trim to the tightest ~30 s, one caption per beat, subtle music, export 9:16.

### 3c. The series (make later, one per week) — 10–15 s each, single feature, depth
For people already interested; keep presence and go deeper. Do NOT lead with these.
1. **Peliaikasuunnittelija** — plan subs & fair minutes across a game/tournament. Caption angle: "Reilu peliaika kaikille."
2. **Pelipaikat** — mark where each player played; per-player breakdown by line/position. "Näe pelipaikkajakauma koko kaudelta."
3. **Ottelukooste & jakaminen** — generate the recap and share it. "Jaa ottelukooste vanhemmille yhdellä napautuksella."
4. **Muodostelmat** — one-tap formation change. "Vaihda muodostelma yhdellä napautuksella."
5. **Kehitystrendit** — player development over time + shareable report. "Seuraa pelaajan kehitystä kauden aikana."

Optional later: futsal support, overtime/penalties, friendlies-out-of-stats, two-level home screen tour.

### 3d. Demo-game setup (realistic, no real people)
Enter this once and reuse for every video. Fictional clubs/players.

- **Home team:** Metsäkylän Pallo (MeP), U11 · **Opponent:** Rantakylän FC · **Result to build toward:** 3–2 (MeP win)
- **Roster (jersey · name):** 1 Onni (GK) · 2 Eetu · 3 Aaro · 4 Väinö · 5 Leo · 6 Niilo · 7 Aleksi · 8 Emil · 9 Hugo · 10 Miro · 11 Veeti · 12 Elias
- **Goals to pre-log (for a rich recap):** 8' Eetu (syöttö Miro) 1–0 · 19' Rantakylä 1–1 · 27' Leo (syöttö Väinö) 2–1 · 34' Eetu (syöttö Veeti) 3–1 · 38' Rantakylä 3–2. Eetu = 2 goals (nice top-scorer line in the recap).

---

## 4. Success signals

- **Battle-test:** Sentry error rate flat/low through each cohort; no critical bugs.
- **Product-market fit whisper:** coaches return for a 2nd and 3rd game (the real metric — not installs).
- **Infra:** Supabase DB/MAU tracking well under Pro limits at the projected user count.
- **Reach:** each video earns comments/questions (engagement) → convert to champions.

## 5. Non-goals
- No paid ads yet (organic + video first; measure before spending).
- No monetization (still parked — grow a retained base first).
- No big-bang launch — deliberate, gated, one channel at a time.
