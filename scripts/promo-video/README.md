# Promo video pipeline

Records the real app in headless Chromium at phone size, drives it with a visible cursor, and renders captioned, phone-framed vertical video (1080x1920, MP4, no sound). The hero video was built with this; any future clip is a new scene script on the same rails.

Rendered video, raw recordings and generated frames live in `out/` and are never committed (see `.gitignore`). Keep finished MP4s wherever you keep marketing assets - not in git.

## Run it

    npm run dev                      # in the repo root, in another terminal (the app must answer on :3000)
    cd scripts/promo-video
    npm install                      # once: ffmpeg-static (Playwright comes from the repo root)
    bash run.sh                      # demo data -> frames -> record -> captions -> encode

Output: `out/hero/matchops-hero-phone.mp4` plus one clip per caption in `out/hero/clips-phone/`. Each video has its own folder under `out/` named after its scene file; the shared intro, end card, phone frame and demo data sit in `out/` itself. `VIDEO=basic bash run.sh` renders the basic-usage video the same way. `STYLE=plain bash run.sh` renders without the phone frame. `bash run.sh timer` re-records only that recording; then `node render/encode.mjs --style phone --out out/hero` re-cuts everything.

## The videos

| Scene file | What it shows |
|------------|---------------|
| `scenes/hero.mjs` | The full story: front page, the planner across a whole tournament, the match from the plan's lineup, the planned-sub prompt, the finish flow, the recap. 138 s. |
| `scenes/start.mjs` | "Aloitus alle minuutissa": create the account, name the team, add eleven players, land on Home. Cloud mode against staging with a throwaway synthetic account (delete them afterwards: `delete from auth.users where email = 'mepa.valmentaja@example.com'` on STAGING only). About 50 s. |
| `scenes/create.mjs` | "Luo ottelu": from the empty Home to the front-page card with the departure time. Team pick fills roster and season, the venue is created from a name and a map address (real place: Ukonniemi, Imatra), the starting point is set from the card's own prompt. Local mode, `freshState` seed (the demo club with no matches). About 90 s. |
| `scenes/advanced.mjs` | "Ottelun asetukset tarkemmin": repeat last game, season with its official league and a tournament with its series, age group and sport, prefill from a plan, periods and length with the friendly toggle, pitch number and a coach. Ends on the filled form, never creates. `advancedState` seed (the club plus one coach and one tournament; personnel is a map keyed by id). About 75 s. |
| `scenes/basic.mjs` | The same day without a plan: the game opens on an empty pitch, the coach taps a player and a spot to place the lineup, the interval substitution reminder turns due and is cleared, then the same finish flow. About 100 s. |

Python needs Pillow (`pip install pillow`).

## Music

`MUSIC=path/to/track.mp3 bash run.sh` (or `node render/encode.mjs --style phone --music track.mp3`) writes a second hero, `out/matchops-hero-phone-music.mp4`, with the track looped under the video: 2 s crossfade between repeats, fade in over the intro, fade out over the end card, levelled to -18 LUFS (`--music-lufs` to taste). The silent hero and the clips are unchanged; Instagram and TikTok get the silent one and a sound added in the app.

Only a licensed track goes into a published render. A stock-site preview is for judging the fit privately, never for upload. The track itself stays out of git (it is in `out/music/`, and in the marketing assets folder); its licence certificate and a note of the source live in `assets/licences/`. The hero and basic videos use "Warm Hip Hop Beat" by CoffeeMusic, Envato Elements item BLFRU7R, licence code HK2RXGA9YT: YouTube raises a Content ID claim on it (claimant Epic Elite), cleared by disputing with that certificate.

## The pieces

| File | Does |
|------|------|
| `demo/make-demo.mjs` | The fictional club (Metsäkylän Pallo / MePa, 14 invented players, six played matches, Saturday's fixture at a pinned venue, a three-game tournament plan). Writes `out/demo-backup.json` - also restorable in the app (Settings > Data) for hand-held shots. |
| `lib/seeds.mjs` | App states built from that backup: `front` (Home + planner + field), `timer` (the match at 9:46, positions and a report already in place), `played` (the result on Home). |
| `lib/recorder.mjs` | The scene harness: seeding, cursor, taps, dropdown drawing, scroll helpers, timing marks. Read its header comment before changing anything. |
| `scenes/hero.mjs`, `scenes/basic.mjs` | Each video's captions and its three recordings. Copy one for a new video. |
| `render/frame-assets.py` | Intro card (icon, wordmark, tagline), end card (official Google Play badge), phone frame layers. |
| `render/captions.py` | Caption band PNGs for each caption id, for the plain canvas or inside the phone screen. |
| `render/encode.mjs` | Cuts recordings into clips by the marks for stand-alone use, and builds the hero separately: each recording in one pass with its captions switched on by time (0.25 s fades) and a short dip to navy where recordings change, so nothing flickers at a caption change. |

## The locked look

- **Canvas** 1080x1920, ground `#0b1220` (the app's navy). Phone screen recorded at 2x (780x1688).
- **Phone frame** like the marketing site's `.phone-frame`: 14 px graphite bezel (gradient `#3a3a3a` to `#1a1a1a`), 52 px screen corner radius, camera dot, soft drop shadow and a faint amber glow. Geometry in `out/phone-geom.json`.
- **Captions**: Rajdhani Bold 48 px (52 px plain), white on a `#0b1220` band at 78% opacity, corner radius 18, band hugs the text (max 764 px inside the phone), bottom edge 230 px above the screen's bottom. One caption per clip, burned in. Sentences, Finnish, no trailing period on the short ones.
- **Cursor**: 30 px white ring; glides 0.65 s (1.8 s for a deliberate long move), rests 0.85 s on the target, then a 52 px ripple. A quick loop around an element introduces it (`orbit`).
- **Pace**: hold 2.5-3.5 s on anything the viewer must read, 6 s on a full text screen (Ottelukooste). Intro 3.2 s with a 0.7 s fade into scene 1; end card 3 s.
- **Intro line** `Suunnittele - kirjaa - oivalla`; end card = wordmark + `Lataa se Google Playsta` badge.
- **Content rules**: fictional data only; the owner's own 8v8 2-1-2-1-1 formation; subs go to the wingers and the striker; playing time shown as a distribution across games, never as a promise of equal minutes.

## Writing a new scene

1. Pick or add a seed state in `lib/seeds.mjs` (everything is a full IndexedDB payload; positions, events, clock, `isPlayed` are all just fields on the game).
2. In a scene file, call `rec.scene(name, state, { inMatch, startCur }, async (h) => { ... })`. Use `h.tap(locator)`, `h.tapAt(x, y)` for canvas targets such as a pitch position, `h.glide`, `h.orbit`, `h.pickFromSelect('#scorerSelect', playerId)`, `h.scrollToHeading('Maaliloki')`, `h.scrollToId('positions-editor')`, `h.scrollPanelTop(sel)`, `h.hold(ms)`, and `h.mark(id)` where each captioned clip starts. Re-run `h.arm()` after any screen change.
3. Put the caption for each id in the CAPTIONS map; an id without a caption becomes an uncaptioned transition clip.
4. One recording per continuous clock: never let a clip boundary reset the timer (it reads as pause/play).

## Gotchas already paid for

- Scene marks are measured from context creation, and the encoder rescales them per file; do not "fix" timing by adding offsets.
- The planned-sub ghost rings on the pitch stall the screencast: seed the field without planned subs when the field is the subject.
- The planner's header collapses on scroll; scroll the panel to its top (`scrollPanelTop`) before reaching for a tab.
- Native `<select>` popups are OS windows: use `pickFromSelect`, which draws the list from the select's own options.
- Placing a player from the bar is tap-then-tap, not a drag: a mousedown on the bar disc selects it, the next mousedown on the pitch places it.
- A scene with `cloud: true` seeds nothing and boots to the sign-up form; `npm run dev` points at staging, which auto-confirms accounts. Never point it at prod. `h.type(locator, text)` types at a human pace.
- Swapping two pitch discs is a touch-only gesture (tap one, tap the other); the mouse path drags. Use `h.touchTap(x, y)`, which fires synthetic touch events, so the film shows what a phone does.
- Modals have no X on phones (the back gesture closes them); the recorder unhides the header close button of every dialog ("Sulje", and "Valmis" on settings) and buffers history so a back-pop stays in the app.
- The address fields search a live geocoder (Photon): allow up to 15 s for the list and use real places; invented street names return other towns. Selecting a team prefills the home ground into the venue name, so clear it before typing a new one.
- The app refuses a second tab (Web Locks); the recorder grants the lock in the init script.
- Only the first `<video>`-sized output under ~15 MB can be attached to a share page; the encoder re-encodes the joined hero at crf 24.
