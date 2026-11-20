/**
 * The basic-usage video: match day without a plan, in the full layout. Home -> the game opens on
 * an empty pitch in the stacked match view -> a formation fills it -> select-and-place (tap a
 * player in the bar, tap a spot) -> the clock -> a goal with scorer and assister -> the sub
 * interval running out and "Nollaa vaihtoajastin" -> full time, Viimeistele ottelu, Pöytäkirja,
 * Otteluraportti and its share sheet. Same rails as hero.mjs; see its header.
 *
 * Usage: node scenes/basic.mjs [front,timer,finish]
 */
import fs from 'node:fs';
import path from 'node:path';
import { openRecorder } from '../lib/recorder.mjs';
import { loadStates, fromDump, pid, goal, SLOTS } from '../lib/seeds.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = path.join(ROOT, 'out', 'basic');
const only = process.argv[2] ? process.argv[2].split(',') : null;
const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'out', 'demo-backup.json'), 'utf8')).localStorage.soccerMasterRoster;
// Quick goal entry names the scorer by the player's full name (the button's accessible name).
const nameOf = (n) => roster.find((p) => p.id === pid(n)).name;
const nickOf = (n) => roster.find((p) => p.id === pid(n)).nickname;

export const CAPTIONS = {
  '1': 'Seuraava ottelu, lähtöaika ja reitti - kaikki etusivulla',
  '2': 'Tulos ja pelaajat ylhäällä, ohjaimet alhaalla',
  '3': 'Valitse muodostelma - pelaajat asettuvat paikoilleen',
  // top: the bench spot Eino goes to sits where the bottom band would be
  '4': { text: 'Napauta pelaajaa, sitten paikkaa', pos: 'top' },
  '5': 'Kello käyntiin',
  '6': { text: 'Maali meille - valitse tekijä ja syöttäjä', pos: 'top' },
  '7': 'Vaihtoajastin muistuttaa valitsemasi välein',
  '7.5': 'Vaihdon jälkeen: Nollaa vaihtoajastin',
  '8': 'Loppuvihellys: Viimeistele ottelu',
  '8.5': 'Maalit tallentuvat aikoineen',
  '9': 'Pöytäkirja valmiina kopioitavaksi',
  '9.5': 'Merkitse toteutuneet pelipaikat',
  '10': 'Otteluraportti jaettavaksi joukkueen chattiin',
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'captions.json'), JSON.stringify(CAPTIONS, null, 1));

const S = loadStates(path.join(ROOT, 'out', 'demo-backup.json'));
const AFTER_FRONT = path.join(OUT, 'state-front.json');
const rec = await openRecorder({ outDir: OUT });

// Home -> the game -> the stacked match view -> formation -> Leevi to striker, Eino to the bench, by tap-then-tap.
await rec.scene('front', S.basicFront, { only }, async ({ page, arm, tap, tapAt, glide, hold, mark, orbit, dump, tapThroughLoad }) => {
  const card = page.getByTestId('next-match-mark-absences').locator('xpath=..');
  mark(1); await hold(900); await orbit(card); await hold(500);
  mark(2); await tapThroughLoad(page.getByRole('button', { name: /Avaa ottelu/ }).first(), () => page.getByTestId('player-bar').getByText('Eeli', { exact: true }).first().waitFor({ timeout: 90000 })); await hold(1000);
  const bar = page.getByTestId('player-bar');
  await glide(page.getByText('MePa', { exact: true }).first(), 900); await orbit(bar); await hold(300);
  await orbit(page.getByRole('button', { name: 'Muodostelmavalikko' }).locator('xpath=..')); await hold(1800);
  mark(3); await tap(page.getByTestId('tour-formation'), 700); await hold(900); await arm();
  // the 8v8 presets sit below the sheet's fold: bring the item to the middle first
  const preset = page.getByRole('menuitem', { name: /2-1-2-1-1/ }).first();
  await preset.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await hold(1100);
  await tap(preset, 700); await hold(2600); await arm();
  // select-and-place: tap Leevi in the bar, tap the striker's spot; then Eino (now off the pitch), tap the free bench spot
  const fb = await page.getByTestId('soccer-field').boundingBox(); const at = (x, y) => [fb.x + x * fb.width, fb.y + y * fb.height];
  mark(4); await tap(bar.getByText(nickOf(10), { exact: true }).first(), 700); await hold(500);
  await tapAt(...at(SLOTS[7][0], SLOTS[7][1]), 700); await hold(1600);
  await tap(bar.getByText(nickOf(8), { exact: true }).first(), 700); await hold(500);
  await tapAt(...at(0.92, 0.883), 700); await hold(2200);
  await glide(page.getByRole('button', { name: 'Avaa ajastin' }), 1400, 1800); await hold(800);
  await dump(AFTER_FRONT);
});

const T = () => fromDump(AFTER_FRONT);
// One continuous clock from 9:46 with a 5-minute interval last reset at 5:00: start, a goal, the interval runs out at 10:00, reset.
await rec.scene('timer', only && !only.includes('timer') ? null : T().clock(586, { subIntervalMinutes: 5, lastSubConfirmationTimeSeconds: 300 }), { inMatch: true, startCur: [195, 815], only }, async ({ page, arm, tap, glide, hold, mark }) => {
  await hold(400); await tap(page.getByRole('button', { name: 'Avaa ajastin' }), 200); await hold(900); await arm();
  mark(5); await tap(page.getByRole('button', { name: 'Käynnistä' })); await hold(1800);
  mark(6); await tap(page.getByRole('button', { name: 'Maali meille' }).first()); await hold(900); await arm();
  const names = page.getByTestId('quick-goal-names');
  await tap(names.getByRole('button', { name: nameOf(10), exact: true }), 700); await hold(800); await arm();
  await tap(names.getByRole('button', { name: nameOf(7), exact: true }), 600); await hold(1800);
  mark(7); await glide(page.getByTestId('timer-sub-interval'), 1500); await glide(page.getByTestId('timer-clock'), 2400); await hold(2600);
  mark(7.5); await tap(page.getByRole('button', { name: 'Nollaa vaihtoajastin' }), 900); await hold(1200); await glide(page.getByTestId('timer-since-sub'), 2400); await hold(600);
});

// Full time from 49:52: the clock runs out, Viimeistele ottelu, the goal log, Pöytäkirja, positions, the report and its share sheet.
const EVENTS = [goal('ev_b_1', 590, pid(10), pid(7)), { id: 'ev_b_2', type: 'opponentGoal', time: 1870 }, goal('ev_b_3', 2840, pid(9), pid(11))];
await rec.scene('finish', only && !only.includes('finish') ? null : T().fullTime(2992, EVENTS, { subIntervalMinutes: 5, lastSubConfirmationTimeSeconds: 2880 }, { 8: 'lm', 9: 'rm', 11: 'st' }), { inMatch: true, startCur: [195, 815], only }, async ({ page, arm, tap, glide, glideTo, hold, mark, scrollToHeading, scrollToSelector, tapThroughLoad }) => {
  await hold(400); await tap(page.getByRole('button', { name: 'Avaa ajastin' }), 200); await hold(900); await arm();
  await tap(page.getByRole('button', { name: /Käynnistä|Jatka/ }).first()); await page.getByTestId('timer-finish-game').waitFor({ timeout: 30000 }); await hold(1400);
  // the timer closes before the finish screen opens: dip over the match view in between
  mark(8); await hold(800); await tapThroughLoad(page.getByTestId('timer-finish-game'), () => page.getByRole('button', { name: 'Pöytäkirja' }).first().waitFor({ timeout: 30000 }), 800); await hold(1600);
  mark(8.5); await scrollToHeading('Maaliloki'); await hold(4000);
  mark(9); await tap(page.getByRole('button', { name: 'Pöytäkirja' }).first(), 700); await hold(4400); await arm();
  await glide(page.getByRole('button', { name: 'Kopioi' }).first(), 1600); await hold(300);
  // the cursor then leaves the X, or it reads as a highlight on it
  await tap(page.getByRole('button', { name: 'Sulje' }).last(), 600); await hold(500); await arm(); await glideTo(250, 470, 300);
  mark(9.5); await scrollToSelector('[data-testid="positions-editor"]', 'start'); await hold(3600);
  mark(10); await scrollToHeading('Otteluraportti'); await hold(2600);
  await tap(page.getByRole('button', { name: 'Jaa otteluraportti' }).first(), 700); await hold(5200);
  await glide(page.getByRole('button', { name: 'Kopioi' }).first(), 1800); await hold(400);
});
await rec.close();
