/**
 * App states for the hero and basic videos, built from the fictional demo club (demo/make-demo.mjs).
 * Every state is the full IndexedDB key/value payload the app boots from. Each video's first
 * recording starts from `loadStates`; the later ones from `fromDump`, i.e. from what the previous
 * recording left in the app.
 */
import fs from 'node:fs';
export const pid = (n) => `player_demo_${String(n).padStart(2, '0')}`;
export const FIXTURE = 'game_demo_07';
// 8v8 2-1-2-1-1 (the owner's own formation): gk + 7
export const SLOTS = [[0.5, 0.92], [0.25, 0.82], [0.75, 0.82], [0.5, 0.68], [0.25, 0.52], [0.75, 0.52], [0.5, 0.38], [0.5, 0.24]];
/** Who turned up for the basic-usage match day: the lineup plus three on the bench. */
export const PRESENT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
/** The fixture was made from the plan's first game (plan_demo_syksy / pg1). The hero's attendance step
 *  re-applies the plan to it, which rebuilds the lineup and the planned-sub schedule, so this link is
 *  all the seed has to provide. */
export const LINKS = { [FIXTURE]: { planId: 'plan_demo_syksy', planGameId: 'pg1' } };
export const goal = (id, time, scorerId, assisterId) => ({ id, type: 'goal', time, scorerId, assisterId });
const ROLES = ['gk', 'lb', 'rb', 'cdm', 'lm', 'rm', 'cam', 'st'];
/** The finish screen's "Toteutuneet pelipaikat": each starter's role from where they stand on the pitch
 *  (nearest 2-1-2-1-1 slot), plus `more` (player number -> role) for those who came on. */
export const positions = (game, more = {}) => {
  const out = {};
  for (const p of game.playersOnField || []) {
    if (p.relX > 0.9) continue; // the sideline bench
    let k = 0, best = Infinity; SLOTS.forEach(([x, y], i) => { const d = (x - p.relX) ** 2 + (y - p.relY) ** 2; if (d < best) { best = d; k = i; } });
    (out[p.id] ||= []).push(ROLES[k]);
  }
  for (const [n, role] of Object.entries(more)) { const id = pid(Number(n)); if (!(out[id] || []).includes(role)) (out[id] ||= []).push(role); }
  return out;
};
/** The coach's own match report on the finish screen (typed after the final whistle in real life). */
export const report = () => 'Hyvä avaus: Leevi vei meidät johtoon ensimmäisellä jaksolla Oliverin syötöstä. Toisella jaksolla puolustus pysyi tiiviinä ja Niilo ratkaisi pelin lopussa. Laitapelaajien juoksuvoima riitti loppuun asti.';

/** The club with no matches yet and no starting point: the state video 1 ends in, for "Luo ottelu". */
export function freshState(backupPath) {
  const d = JSON.parse(JSON.stringify(JSON.parse(fs.readFileSync(backupPath, 'utf8')).localStorage));
  d.savedSoccerGames = {}; d.soccerPlaytimePlans = []; d.soccerPlaytimePlanLinks = {}; d.soccerPlaytimeGameSubs = {};
  delete d.soccerAppSettings.startingPoint; delete d.soccerAppSettings.knownVenues; delete d.soccerAppSettings.currentGameId;
  return d;
}

/** The club with its history plus one coach and one tournament, for the deeper game-form tour. */
export function advancedState(backupPath) {
  const d = JSON.parse(JSON.stringify(JSON.parse(fs.readFileSync(backupPath, 'utf8')).localStorage));
  const now = '2026-09-22T09:00:00.000Z';
  // personnel is a map keyed by id, not an array
  d.soccerPersonnel = { personnel_demo_01: { id: 'personnel_demo_01', name: 'Mika Virtanen', role: 'head_coach', createdAt: now, updatedAt: now } };
  d.soccerTournaments = [{ id: 'tournament_demo_syksy', name: 'Syksyn turnaus', startDate: '2026-10-03', endDate: '2026-10-03', gameType: 'soccer', ageGroup: 'U12', series: [{ id: 'series_demo_a', level: 'A-sarja' }], createdAt: now, updatedAt: now }];
  return d;
}

const clone = (x) => JSON.parse(JSON.stringify(x));

/** Home with the fixture: no lineup yet for the basic video (the coach places it by hand), the
 *  plan's link for the hero (the card offers Näytä suunnitelma / Jaa and the attendance re-plan). */
export function loadStates(backupPath) {
  const base = JSON.parse(fs.readFileSync(backupPath, 'utf8')).localStorage;
  const variant = (mod) => { const d = clone(base); mod(d.savedSoccerGames[FIXTURE], d); return d; };
  return {
    basicFront: variant((g) => { g.playersOnField = []; g.selectedPlayerIds = PRESENT.map(pid); g.subIntervalMinutes = 5; }),
    heroFront: variant((g, d) => { g.playersOnField = []; d.soccerPlaytimePlanLinks = LINKS; }),
  };
}

/**
 * The match a little before a moment worth filming, built from what the previous recording left in
 * the app (`dump`), so the lineup on film is the one the viewer just saw being made.
 *  - `clock(at)`: first half, clock stopped at `at` seconds, no goals yet.
 *  - `fullTime(at, events, extra, cameOn)`: second half at `at` seconds with `events` already in the
 *    log, positions from the pitch plus `cameOn` (the subs' roles), the coach's report already written.
 */
export function fromDump(dumpPath) {
  const base = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  const variant = (mod) => { const d = clone(base); const g = d.savedSoccerGames[FIXTURE]; mod(g, d); d.soccerAppSettings.currentGameId = FIXTURE; return d; };
  const running = { gameStatus: 'inProgress', isTimerRunning: false, startTimestamp: null, isPlayed: false };
  return {
    clock: (at, extra = {}) => variant((g) => Object.assign(g, running, { currentPeriod: 1, timeElapsedInSeconds: at, homeScore: 0, awayScore: 0, gameEvents: [], completedIntervalDurations: [] }, extra)),
    fullTime: (at, events, extra = {}, cameOn = {}) => variant((g) => {
      const ours = events.filter((e) => e.type === 'goal').length, theirs = events.filter((e) => e.type === 'opponentGoal').length;
      const away = g.homeOrAway === 'away';
      Object.assign(g, running, { currentPeriod: 2, timeElapsedInSeconds: at, homeScore: away ? theirs : ours, awayScore: away ? ours : theirs, gameEvents: events, playerPositions: positions(g, cameOn), gameNotes: report() }, extra);
    }),
  };
}
