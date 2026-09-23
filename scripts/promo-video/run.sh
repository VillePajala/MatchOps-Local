#!/usr/bin/env bash
# End to end: demo data -> static frames -> recordings -> captions -> encode. Needs `npm run dev` running in the repo root.
set -euo pipefail
cd "$(dirname "$0")"
STYLE="${STYLE:-phone}"; SCENES="${1:-}"
curl -sf -o /dev/null --max-time 60 http://localhost:3000/ || { echo "dev server not answering on :3000 - run 'npm run dev' in the repo root first"; exit 1; }
[ -d node_modules ] || npm install --silent
node demo/make-demo.mjs
python3 render/frame-assets.py
node scenes/hero.mjs $SCENES
python3 render/captions.py --style "$STYLE"
node render/encode.mjs --style "$STYLE"
