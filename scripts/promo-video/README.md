# Promo video pipeline

Records the real app in headless Chromium at phone size, drives it with a visible cursor, and renders captioned, phone-framed vertical video (1080x1920, MP4, no sound). The hero video was built with this; any future clip is a new scene script on the same rails.

Rendered video, raw recordings and generated frames live in `out/` and are never committed (see `.gitignore`). Keep finished MP4s wherever you keep marketing assets - not in git.

## Run it

    npm run dev                      # in the repo root, in another terminal (the app must answer on :3000)
    cd scripts/promo-video
    npm install                      # once: ffmpeg-static (Playwright comes from the repo root)
    bash run.sh                      # demo data -> frames -> record -> captions -> encode

Output: `out/matchops-hero-phone.mp4` plus one clip per caption in `out/clips-phone/`. `STYLE=plain bash run.sh` renders without the phone frame. `bash run.sh timer` re-records only that recording; then `node render/encode.mjs --style phone` re-cuts everything.

Python needs Pillow (`pip install pillow`).

## Music

`MUSIC=path/to/track.mp3 bash run.sh` (or `node render/encode.mjs --style phone --music track.mp3`) writes a second hero, `out/matchops-hero-phone-music.mp4`, with the track looped under the video: 2 s crossfade between repeats, fade in over the intro, fade out over the end card, levelled to -18 LUFS (`--music-lufs` to taste). The silent hero and the clips are unchanged; Instagram and TikTok get the silent one and a sound added in the app.

Only a licensed track goes into a published render. A stock-site preview is for judging the fit privately, never for upload. Keep the track and its license certificate in the marketing assets folder, not in git.

## The pieces

| File | Does |
|------|------|
| `demo/make-demo.mjs` | The fictional club (Metsäkylän Pallo / MePa, 14 invented players, six played matches, Saturday's fixture at a pinned venue, a three-game tournament plan). Writes `out/demo-backup.json` - also restorable in the app (Settings > Data) for hand-held shots. |
| `lib/seeds.mjs` | App states built from that backup: `front` (Home + planner + field), `timer` (the match at 9:46, positions and a report already in place), `played` (the result on Home). |
| `lib/recorder.mjs` | The scene harness: seeding, cursor, taps, dropdown drawing, scroll helpers, timing marks. Read its header comment before changing anything. |
| `scenes/hero.mjs` | The hero's captions and its three recordings. Copy it for a new video. |
| `render/frame-assets.py` | Intro card (icon, wordmark, tagline), end card (official Google Play badge), phone frame layers. |
| `render/captions.py` | Caption band PNGs for each caption id, for the plain canvas or inside the phone screen. |
| `render/encode.mjs` | Cuts recordings into clips by the marks, overlays captions, joins the hero. |

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
2. In a scene file, call `rec.scene(name, state, { inMatch, startCur }, async (h) => { ... })`. Use `h.tap(locator)`, `h.glide`, `h.orbit`, `h.pickFromSelect('#scorerSelect', playerId)`, `h.scrollToHeading('Maaliloki')`, `h.scrollToId('positions-editor')`, `h.scrollPanelTop(sel)`, `h.hold(ms)`, and `h.mark(id)` where each captioned clip starts. Re-run `h.arm()` after any screen change.
3. Put the caption for each id in the CAPTIONS map; an id without a caption becomes an uncaptioned transition clip.
4. One recording per continuous clock: never let a clip boundary reset the timer (it reads as pause/play).

## Gotchas already paid for

- Scene marks are measured from context creation, and the encoder rescales them per file; do not "fix" timing by adding offsets.
- The planned-sub ghost rings on the pitch stall the screencast: seed the field without planned subs when the field is the subject.
- The planner's header collapses on scroll; scroll the panel to its top (`scrollPanelTop`) before reaching for a tab.
- Native `<select>` popups are OS windows: use `pickFromSelect`, which draws the list from the select's own options.
- Modals have no X on phones (the back gesture closes them); the recorder unhides the planner's X and buffers history so a back-pop stays in the app.
- The app refuses a second tab (Web Locks); the recorder grants the lock in the init script.
- Only the first `<video>`-sized output under ~15 MB can be attached to a share page; the encoder re-encodes the joined hero at crf 24.
