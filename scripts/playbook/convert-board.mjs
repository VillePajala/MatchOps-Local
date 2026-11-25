#!/usr/bin/env node
/**
 * Converts a Playbook prototype "board" page (the single-file HTML tactics
 * board the PEPO 8v8 concepts were first drawn in) into Playbook concept JSON
 * (src/playbook/types.ts).
 *
 * The board keeps its data in an inline script: formations as id -> [x, y]
 * maps, helper constructors for arrows (pa/lo/ru/dr/pr/sh) and zones
 * (E/R/BAND/POLY/LINK), a PHASES map and the scenario list `SC`. That block is
 * cut out of the page and evaluated in an empty `vm` context (after a check
 * that it is plain data: no imports, no globals), then each scenario is mapped
 * onto the concept format:
 *
 *   step 0 positions -> players[].start     later `p` -> step.positions
 *   t / x            -> step title / text   q         -> question
 *   ball             -> ball                hl        -> highlights
 *   a (arrows)       -> arrows; the board's absolute bend `b` becomes a
 *                       fraction of the arrow length, `n` becomes a label
 *   z (zones)        -> ellipse / rect / band / poly / link
 *   cut              -> cut (a new variation: players jump, not move)
 *
 * Usage:
 *   node scripts/playbook/convert-board.mjs <board.html> [out.json]
 *     [--id pepo-8v8] [--name "PEPO Pelitapa 8v8"] [--format 8v8] [--note "..."]
 * Writes { playbook: { id, name, format }, concepts: [...] } and prints what
 * could not be carried over faithfully. Validity is checked by the app's own
 * validator in src/playbook/__tests__/playbookContent.test.ts.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

/** The board's phase keys -> the app's phase names (src/playbook/phases.ts). */
export const BOARD_PHASES = {
  perus: 'Perusteet',
  hyok: 'Hyökkääminen',
  puol: 'Puolustaminen',
  tvp: 'Tilanteenvaihto +',
  tvm: 'Tilanteenvaihto −',
  erik: 'Erikoistilanteet',
};

const ARROW_KINDS = { pass: 'pass', long: 'long', run: 'run', drib: 'drib', press: 'press', shot: 'shot' };

/** The board numbers our players 1..n (1 = keeper) and theirs a1..an (a1 = keeper). */
export const isOpponentId = (id) => id.startsWith('a');
const DEFAULT_KEEPERS = new Set(['1', 'a1']);

const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const pt = (p) => [round(p[0]), round(p[1])];

/** The inline data block of the board page: formations, helpers, PHASES and SC. */
export function extractBoardSource(html) {
  const start = html.indexOf('/* ---------- formations');
  const end = html.indexOf('const byId=');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Board data block not found (expected "/* ---------- formations" ... "const byId=")');
  }
  return html.slice(start, end);
}

/** Evaluates the data block in an empty context and returns { SC, PHASES }. */
export function evaluateBoard(source) {
  const forbidden = /\b(require|import|process|globalThis|Function|eval|constructor|prototype|document|window|fetch|setTimeout)\b/;
  const hit = source.match(forbidden);
  if (hit) throw new Error(`Board data block contains "${hit[0]}": refusing to evaluate`);
  const context = vm.createContext(Object.create(null));
  const result = vm.runInContext(`${source}\n;({ SC, PHASES: typeof PHASES === 'undefined' ? {} : PHASES })`, context, {
    timeout: 1000,
  });
  if (!result || !Array.isArray(result.SC)) throw new Error('Board data block has no SC list');
  // Through JSON: plain data out of the sandbox, nothing callable.
  return JSON.parse(JSON.stringify(result));
}

/**
 * One board scenario -> one concept. Returns { concept, gaps } where gaps lists
 * what the concept format cannot carry (the concept is still usable).
 */
export function convertScenario(sc, { format = '8v8', phases = BOARD_PHASES, keepers = DEFAULT_KEEPERS } = {}) {
  const gaps = [];
  const note = (msg) => gaps.push(`${sc.id}: ${msg}`);

  // Positions accumulate step by step, as on the board (null removes a piece).
  const frames = [];
  let P = {};
  for (const st of sc.steps) {
    P = { ...P };
    for (const [id, v] of Object.entries(st.p ?? {})) {
      if (v === null) {
        delete P[id];
        note(`step "${st.t}" removes player ${id}; concepts keep every player on the pitch`);
      } else P[id] = v;
    }
    frames.push(P);
  }

  const first = frames[0];
  const ids = Object.keys(first);
  for (const f of frames) {
    for (const id of Object.keys(f)) {
      if (!ids.includes(id)) {
        ids.push(id);
        note(`player ${id} appears after the first step; it is shown from the start`);
      }
    }
  }
  const startOf = (id) => first[id] ?? frames.find((f) => f[id])[id];
  const order = (id) => (isOpponentId(id) ? 1 : 0);
  const players = [...ids]
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'en', { numeric: true }))
    .map((id) => ({
      id,
      side: isOpponentId(id) ? 'opp' : 'us',
      ...(keepers.has(id) ? { role: 'gk' } : {}),
      start: pt(startOf(id)),
    }));

  const steps = sc.steps.map((st, i) => {
    const frame = frames[i];
    const at = (ref) => (typeof ref === 'string' ? frame[ref] : ref);
    const step = { title: st.t, text: st.x ?? '' };
    if (i > 0 && st.p) {
      const positions = {};
      for (const [id, v] of Object.entries(st.p)) if (v !== null) positions[id] = pt(v);
      if (Object.keys(positions).length) step.positions = positions;
    }
    if (st.ball !== undefined && st.ball !== null) step.ball = typeof st.ball === 'string' ? st.ball : pt(st.ball);
    if (st.cut) step.cut = true;

    if (st.a?.length) {
      step.arrows = st.a.map((a) => {
        const kind = ARROW_KINDS[a.k];
        if (!kind) throw new Error(`${sc.id}: unknown arrow kind "${a.k}"`);
        const arrow = { kind, from: typeof a.f === 'string' ? a.f : pt(a.f), to: typeof a.to === 'string' ? a.to : pt(a.to) };
        // The board bends by an absolute offset of the control point; the
        // engine by a fraction of the length (same side convention).
        const A = at(a.f);
        const B = at(a.to);
        const len = A && B ? Math.hypot(B[0] - A[0], B[1] - A[1]) : 0;
        const bend = a.b && len > 0 ? Math.max(-1, Math.min(1, round(a.b / len, 3))) : 0;
        if (bend !== 0 || kind === 'long') arrow.bend = bend; // long passes otherwise get the default curve
        if (a.n !== undefined && a.n !== null && a.n !== '') arrow.label = String(a.n);
        return arrow;
      });
    }

    if (st.z?.length) {
      step.zones = st.z.map((z) => {
        const label = z.l ? { label: z.l } : {};
        switch (z.k) {
          case 'ell':
            return { kind: 'ellipse', cx: z.cx, cy: z.cy, rx: z.rx, ry: z.ry, ...label };
          case 'rect':
            return { kind: 'rect', x: z.x, y: z.y, w: z.w, h: z.h, ...label };
          case 'band':
            // The board's band is 5.6 units tall.
            return { kind: 'band', y: z.y, h: 5.6, ...label };
          case 'poly':
            return { kind: 'poly', ids: [...z.ids], ...label };
          case 'link':
            return { kind: 'link', ids: [z.ids[0], z.ids[1]], ...label };
          default:
            throw new Error(`${sc.id}: unknown zone kind "${z.k}"`);
        }
      });
    }

    if (st.hl?.length) step.highlights = [...st.hl];
    return step;
  });

  const phase = phases[sc.ph];
  if (!phase) note(`unknown phase "${sc.ph}", kept as is`);

  const concept = {
    id: sc.id,
    title: sc.title,
    phase: phase ?? String(sc.ph),
    format,
    version: 1,
    players,
    steps,
    ...(sc.q ? { question: sc.q } : {}),
  };
  return { concept, gaps };
}

export function convertBoard(html, opts = {}) {
  const { SC } = evaluateBoard(extractBoardSource(html));
  const gaps = [];
  const concepts = SC.map((sc) => {
    const r = convertScenario(sc, opts);
    gaps.push(...r.gaps);
    return r.concept;
  });
  return { concepts, gaps };
}

function parseArgs(argv) {
  const out = { positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
    else out.positional.push(a);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [input, output = 'content/playbook/pepo-8v8.json'] = args.positional;
  if (!input) {
    console.error('Usage: node scripts/playbook/convert-board.mjs <board.html> [out.json] [--id ..] [--name ..] [--format 8v8]');
    process.exit(2);
  }
  const format = args.format ?? '8v8';
  const { concepts, gaps } = convertBoard(readFileSync(input, 'utf8'), { format });
  const doc = {
    playbook: {
      id: args.id ?? 'pepo-8v8',
      name: args.name ?? 'PEPO Pelitapa 8v8',
      ownerNote: args.note ?? 'Converted from the PEPO 8v8 board prototype with scripts/playbook/convert-board.mjs.',
    },
    concepts,
  };
  writeFileSync(output, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`Converted ${concepts.length} scenarios (${concepts.reduce((n, c) => n + c.steps.length, 0)} steps) -> ${output}`);
  if (gaps.length) {
    console.log('Not carried over faithfully:');
    for (const g of gaps) console.log(`  - ${g}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('convert-board.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
