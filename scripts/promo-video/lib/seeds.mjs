/**
 * App states for the hero, built from the fictional demo club (demo/make-demo.mjs).
 * Every state is the full IndexedDB key/value payload the app boots from.
 */
import fs from 'node:fs';
export const pid = (n) => `player_demo_${String(n).padStart(2, '0')}`;
export const FIXTURE = 'game_demo_07';
// 8v8 2-1-2-1-1 (the owner's own formation): gk + 7
export const SLOTS = [[0.5, 0.92], [0.25, 0.82], [0.75, 0.82], [0.5, 0.68], [0.25, 0.52], [0.75, 0.52], [0.5, 0.38], [0.5, 0.24]];
export const LINEUP = [1, 2, 3, 4, 5, 6, 7, 10];
/** Planned subs on the fixture: the two wingers and the striker, the running-heavy roles. */
export const SUBS = { [FIXTURE]: [
  { id: 'gs1', timeSeconds: 600, slotId: 's3', inPlayerId: pid(8), outPlayerId: pid(5), positionLabel: 'LM' },
  { id: 'gs2', timeSeconds: 1200, slotId: 's4', inPlayerId: pid(9), outPlayerId: pid(6), positionLabel: 'RM' },
  { id: 'gs3', timeSeconds: 1800, slotId: 's6', inPlayerId: pid(11), outPlayerId: pid(10), positionLabel: 'ST' } ] };
export const LINKS = { [FIXTURE]: { planId: 'plan_demo_syksy', planGameId: 'pg1' } };
export const goal = (id, time, scorerId, assisterId) => ({ id, type: 'goal', time, scorerId, assisterId });
export const positions = () => ({ [pid(1)]: ['gk'], [pid(2)]: ['lb'], [pid(3)]: ['rb'], [pid(4)]: ['cdm'], [pid(5)]: ['lm'], [pid(6)]: ['rm'], [pid(7)]: ['cam'], [pid(10)]: ['st'], [pid(8)]: ['lm'], [pid(9)]: ['rm'], [pid(11)]: ['st'] });
export const report = () => 'Hyvä avaus: Leevi vei meidät johtoon kymmenen minuutin kohdalla Oliverin syötöstä. Toisella jaksolla puolustus pysyi tiiviinä ja vaihdot toimivat suunnitelman mukaan. Laitapelaajien juoksuvoima riitti loppuun asti.';

export function loadStates(backupPath) {
  const base = JSON.parse(fs.readFileSync(backupPath, 'utf8')).localStorage;
  const variant = (mod, withSubs = true) => { const d = JSON.parse(JSON.stringify(base)); if (withSubs) { d.soccerPlaytimeGameSubs = SUBS; d.soccerPlaytimePlanLinks = LINKS; } const g = d.savedSoccerGames[FIXTURE]; if (mod) mod(g, d); return d; };
  const planLineup = (g) => {
    g.playersOnField = LINEUP.map((n, k) => ({ ...g.availablePlayers.find(p => p.id === pid(n)), relX: SLOTS[k][0], relY: SLOTS[k][1] }));
    // the planned incoming subs wait on the right sideline, as a match created from the plan has them
    for (const [n, relY] of [[8, 0.60], [9, 0.44], [11, 0.24]]) g.playersOnField.push({ ...g.availablePlayers.find(p => p.id === pid(n)), relX: 0.96, relY });
    g.subIntervalMinutes = 15;
  };
  return {
    /** Home with the fixture; no planned subs so the pitch has no ghost rings (they stall the recorder). */
    front: variant((g) => { planLineup(g); }, false),
    /** The match at 9:46, clock stopped, no goals yet; positions and a report already in place for the finish flow. */
    timer: variant((g) => { planLineup(g); Object.assign(g, { playerPositions: positions(), gameNotes: report(), gameStatus: 'inProgress', currentPeriod: 1, timeElapsedInSeconds: 586, isTimerRunning: false, startTimestamp: null, homeScore: 0, awayScore: 0, gameEvents: [], nextSubDueTimeSeconds: 900, lastSubConfirmationTimeSeconds: 0, subAlertLevel: 'none' }); }),
    /** The same match played and won 1-0 away, for the closing Home view. */
    played: variant((g) => { Object.assign(g, { gameStatus: 'gameEnd', currentPeriod: 2, timeElapsedInSeconds: 3000, isTimerRunning: false, isPlayed: true, homeScore: 0, awayScore: 1, gameEvents: [goal('ev_v_1', 592, pid(10), pid(7))] }); }),
  };
}
