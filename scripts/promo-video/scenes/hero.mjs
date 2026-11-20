/**
 * The hero video: the match day with a plan. Front page -> the tournament day in the planner
 * (three games, a swap, the balance view) -> the plan on Home's next-match card -> an absence
 * marked, the plan re-made -> the match opens on the plan's lineup -> the clock with the next
 * planned change -> a goal -> full time, Viimeistele ottelu, Pöytäkirja, Otteluraportti.
 *
 * Each `mark(id)` starts a captioned clip; ids with a fraction are extra stops inside a recording,
 * and an id with no caption in CAPTIONS becomes an uncaptioned transition clip. Three recordings,
 * each one continuous clock; the second and third start from what the one before left in the app
 * (out/hero/state-*.json), so run them in order.
 *
 * Usage: node scenes/hero.mjs [front,timer,finish]   (defaults to all three recordings)
 */
import fs from 'node:fs';
import path from 'node:path';
import { openRecorder } from '../lib/recorder.mjs';
import { LANG, ui, outDirFor } from '../lib/ui.mjs';
import { loadStates, fromDump, pid, goal } from '../lib/seeds.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = outDirFor(ROOT.replace(/\/$/, ''), 'hero');
const only = process.argv[2] ? process.argv[2].split(',') : null;
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'out', 'demo-backup.json'), 'utf8')).localStorage.soccerMasterRoster;
// Quick goal entry names the scorer by the player's full name (the button's accessible name).
const nameOf = (n) => roster.find((p) => p.id === pid(n)).name;
const nickOf = (n) => roster.find((p) => p.id === pid(n)).nickname;

const CAPTIONS_FI = {
  '1': 'Seuraava ottelu, lähtöaika ja reitti - kaikki etusivulla',
  '2': 'Suunnittele koko turnauspäivä: kolme peliä, yksi suunnitelma',
  '2.5': 'Jokaiselle pelille kokoonpano ja vaihdot valmiiksi',
  // top: the bench row the cursor taps sits where the bottom band would be
  '3': { text: 'Napauta paikkaa, sitten penkin pelaajaa - minuutit päivittyvät heti', pos: 'top' },
  '3.5': 'Tasapaino näyttää peliajan koko päivän peleistä',
  '4': 'Suunnitelma on seuraavan ottelun kortissa - avaa tai jaa se',
  '5': 'Joku on poissa? Merkitse poissaolijat',
  '5.5': 'Suunnitelma tehdään uudelleen ilman poissaolijaa',
  '6': 'Ottelu aukeaa suunnitelman kokoonpanolla',
  '7': 'Kello käyntiin - seuraava vaihto näkyy alla',
  '8': { text: 'Maali meille - valitse tekijä ja syöttäjä', pos: 'top' },
  '8.5': 'Vaihdon hetki: vihreä kentälle, punainen pois',
  '9': 'Loppuvihellys: Viimeistele ottelu',
  '10': 'Pöytäkirja valmiina kopioitavaksi',
  '10.5': 'Merkitse toteutuneet pelipaikat',
  '11': 'Otteluraportti jaettavaksi joukkueen chattiin',
};
const CAPTIONS_EN = {
  '1': 'Next match, departure time and route - all on the front page',
  '2': 'Plan the whole tournament day: three games, one plan',
  '2.5': 'Line-up and subs ready for every game',
  '3': { text: 'Tap a position, then a bench player - minutes update instantly', pos: 'top' },
  '3.5': 'Balance shows playing time across the whole day',
  '4': 'The plan sits on the next match card - open it or share it',
  '5': 'Someone missing? Mark who is away',
  '5.5': 'The plan is redone without the absent player',
  '6': 'The match opens with the planned line-up',
  '7': 'Clock on - the next change shows below',
  '8': { text: 'Goal for us - pick the scorer and the assist', pos: 'top' },
  '8.5': 'Time to change: green on, red off',
  '9': 'Final whistle: Finish this game',
  '10': 'Match sheet ready to copy',
  '10.5': 'Mark the positions actually played',
  '11': 'Match report, ready for the team chat',
};
export const CAPTIONS = LANG === 'en' ? CAPTIONS_EN : CAPTIONS_FI;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'captions.json'), JSON.stringify(CAPTIONS, null, 1));

const S = loadStates(path.join(ROOT, 'out', 'demo-backup.json'));
const AFTER_FRONT = path.join(OUT, 'state-front.json');
const rec = await openRecorder({ outDir: OUT });
const FIELD = '[data-testid="plan-field-backdrop"]';
const gameTab = (page, label) => page.getByRole('button', { name: label, exact: true }).first();

// Home -> planner: the three games, a swap in game 3, the balance view -> Home's card -> attendance -> the match.
await rec.scene('front', S.heroFront, { only }, async ({ page, arm, tap, glide, hold, mark, orbit, scrollToSelector, scrollPanelTop, dump, tapThroughLoad }) => {
  const card = page.getByTestId('next-match-mark-absences').locator('xpath=..');
  mark(1); await hold(900); await orbit(card); await hold(600);
  mark(2); await tapThroughLoad(page.getByRole('button', { name: ui.planner }).first(), () => page.getByRole('button', { name: ui.planName }).first().waitFor({ timeout: 30000 })); await hold(400);
  await tap(page.getByRole('button', { name: ui.planName }).first(), 600); await hold(1600); await arm();
  await scrollToSelector(FIELD, 'center', 2600); await scrollPanelTop(FIELD);
  mark(2.5); await tap(gameTab(page, 'Kuusiston Kiri'), 600); await hold(900); await scrollToSelector(FIELD, 'center', 2600); await scrollPanelTop(FIELD);
  await tap(gameTab(page, 'Joen Pallo'), 600); await hold(1800);
  // Leo starts game 3 and has the day's most minutes; Toivo the fewest. Tap Leo's position, then Toivo on the bench.
  mark(3); await scrollToSelector(FIELD, 'start', 1400);
  await tap(page.locator('button[aria-label^="#2: "]').first(), 700); await hold(700);
  await tap(page.locator('button', { hasText: /^Toivo/ }).last(), 700); await hold(1200);
  await scrollPanelTop(FIELD, 1400); await hold(2200);
  mark(3.5); await tap(page.locator('#planner-tab-minutes'), 700); await hold(5600);
  await tap(page.getByRole('button', { name: ui.close }).first(), 700); await hold(1300); await arm();
  // the planner's list sits over Home; close it too
  const closeList = page.getByRole('button', { name: ui.close }).first(); if (await closeList.isVisible().catch(() => false)) { await tap(closeList, 500); await hold(1000); await arm(); }
  await scrollPanelTop('[data-testid="next-match-show-plan"]', 900);
  mark(4); await glide(page.getByTestId('next-match-show-plan'), 1300); await glide(page.getByTestId('next-match-share'), 1500); await hold(400);
  mark(5); await tapThroughLoad(page.getByTestId('next-match-mark-absences'), () => page.getByRole('button', { name: nickOf(5), exact: true }).waitFor({ timeout: 30000 })); await hold(600);
  await tap(page.getByRole('button', { name: nickOf(5), exact: true }), 800); await hold(2600);
  await tap(page.getByRole('button', { name: ui.save }).first(), 700); await hold(1400); await arm();
  // the re-made plan: game 1 without the absent player
  mark(5.5); await tapThroughLoad(page.getByTestId('next-match-show-plan'), () => page.locator(FIELD).waitFor({ timeout: 30000 })); await hold(800);
  await scrollToSelector(FIELD, 'center', 3000); await scrollPanelTop(FIELD, 1000);
  await tap(page.getByRole('button', { name: ui.close }).first(), 700); await hold(1200); await arm();
  if (await page.getByRole('button', { name: ui.close }).first().isVisible().catch(() => false)) { await tap(page.getByRole('button', { name: ui.close }).first(), 500); await hold(1000); await arm(); }
  mark(6); await tapThroughLoad(page.getByRole('button', { name: ui.openGame }).first(), () => page.getByTestId('player-bar').getByText('Eeli', { exact: true }).first().waitFor({ timeout: 90000 })); await hold(3200);
  await glide(page.getByRole('button', { name: ui.openTimer }), 1400, 1800); await hold(600);
  await dump(AFTER_FRONT);
});

// One continuous clock from 14:42: start, a goal, the next planned change turning due at 15:00.
const T = () => fromDump(AFTER_FRONT);
await rec.scene('timer', only && !only.includes('timer') ? null : T().clock(882, { subIntervalMinutes: 15, lastSubConfirmationTimeSeconds: 600 }), { inMatch: true, startCur: [195, 815], only }, async ({ page, arm, tap, glide, hold, mark }) => {
  await hold(400); await tap(page.getByRole('button', { name: ui.openTimer }), 200); await hold(900); await arm();
  mark(7); await tap(page.getByRole('button', { name: ui.start })); await hold(1000);
  await glide(page.getByTestId('planned-sub-group'), 2600); await hold(300);
  mark(8); await tap(page.getByRole('button', { name: ui.goalForUs }).first()); await hold(900); await arm();
  const names = page.getByTestId('quick-goal-names');
  await tap(names.getByRole('button', { name: nameOf(10), exact: true }), 700); await hold(800); await arm();
  await tap(names.getByRole('button', { name: nameOf(7), exact: true }), 600); await hold(1800);
  // the change turns due at 15:00: the block goes amber
  mark(8.5); await glide(page.getByTestId('planned-sub-on'), 1200); await glide(page.getByTestId('planned-sub-off'), 1200);
  await page.locator('[data-testid="planned-sub-group"][data-due="true"]').waitFor({ timeout: 30000 }); await hold(2600);
});

// Full time from 49:52: the clock runs out, Viimeistele ottelu, Pöytäkirja, the report and its share sheet.
const EVENTS = [goal('ev_h_1', 888, pid(10), pid(7)), { id: 'ev_h_2', type: 'opponentGoal', time: 1870 }, goal('ev_h_3', 2840, pid(9), pid(11))];
await rec.scene('finish', only && !only.includes('finish') ? null : T().fullTime(2992, EVENTS, { subIntervalMinutes: 15, lastSubConfirmationTimeSeconds: 2700 }, { 8: 'lm', 11: 'st', 12: 'lb', 9: 'rm', 13: 'cdm', 14: 'cam' }), { inMatch: true, startCur: [195, 815], only }, async ({ page, arm, tap, glideTo, hold, mark, scrollToHeading, scrollToSelector, tapThroughLoad }) => {
  await hold(400); await tap(page.getByRole('button', { name: ui.openTimer }), 200); await hold(900); await arm();
  await tap(page.getByRole('button', { name: ui.startOrResume }).first()); await page.getByTestId('timer-finish-game').waitFor({ timeout: 30000 }); await hold(1400);
  // the timer closes before the finish screen opens: dip over the match view in between
  mark(9); await hold(1000); await tapThroughLoad(page.getByTestId('timer-finish-game'), () => page.getByRole('button', { name: ui.matchSheet }).first().waitFor({ timeout: 30000 }), 800); await hold(1800);
  mark(10); await tap(page.getByRole('button', { name: ui.matchSheet }).first(), 700); await hold(4800); await arm();
  // the cursor then leaves the X, or it reads as a highlight on it
  await tap(page.getByRole('button', { name: ui.close }).last(), 600); await hold(500); await arm(); await glideTo(250, 470, 300);
  mark(10.5); await scrollToSelector('[data-testid="positions-editor"]', 'start'); await hold(3600);
  mark(11); await scrollToHeading(ui.reportHeading); await hold(2600);
  await tap(page.getByRole('button', { name: ui.shareReport }).first(), 700); await hold(5200);
});
await rec.close();
