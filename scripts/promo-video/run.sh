#!/usr/bin/env bash
# End to end: demo data -> static frames -> recordings -> captions -> encode. Needs `npm run dev` running in the repo root.
set -euo pipefail
cd "$(dirname "$0")"
VIDEO="${VIDEO:-hero}"; STYLE="${STYLE:-phone}"; SCENES="${1:-}"; MUSIC="${MUSIC:-}"; WIDE="${WIDE:-}"; export VLANG="${VLANG:-fi}"   # VLANG=en records the app in English (out/<video>/en/, files -en); VIDEO=<scene file name>; MUSIC=path/to/track.mp3 adds a music version; WIDE=1 a 16:9 copy
curl -sf -o /dev/null --max-time 60 http://localhost:3000/ || { echo "dev server not answering on :3000 - run 'npm run dev' in the repo root first"; exit 1; }
[ -d node_modules ] || npm install --silent
node demo/make-demo.mjs
if [ "$VLANG" = en ]; then python3 render/frame-assets.py --lang en --tagline "Plan, rotate, record."; DIR="out/$VIDEO/en"; else python3 render/frame-assets.py; DIR="out/$VIDEO"; fi
node "scenes/$VIDEO.mjs" $SCENES
python3 render/captions.py --style "$STYLE" --out "$DIR"
node render/encode.mjs --style "$STYLE" --out "$DIR" --name "$VIDEO" --lang "$VLANG" ${MUSIC:+--music "$MUSIC"} ${WIDE:+--wide}
