/**
 * The basic-usage video: the hero without the planner. The coach opens the game from the front
 * page, places the lineup by hand, runs the clock, logs a goal, gets the interval substitution
 * reminder, and finishes the match the same way. Same rails as hero.mjs; see its header.
 *
 * Usage: node scenes/basic.mjs [front,timer,after]
 */
import fs from 'node:fs';
import path from 'node:path';
import { openRecorder } from '../lib/recorder.mjs';
import { loadStates, pid, SLOTS } from '../lib/seeds.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = path.join(ROOT, 'out', 'basic');
const only = process.argv[2] ? process.argv[2].split(',') : null;

export const CAPTIONS = {
  '1': 'Seuraava peli, lähtöaika ja reitti - kaikki etusivulla.',
  '2': 'Valitse pelimuodostelma ja vaihda paikkoja napauttamalla.',
  '3': 'Ottelu voi alkaa, käynnistetään kello.',
  '4': 'Kirjaa maalit ja syötöt reaaliajassa.',
  '5': 'Vaihtomuistutus hälyttää valitsemallasi välillä.',
  '6': 'Tarkistuslista muistuttaa pelin viimeistelytoimenpiteistä',
  '6.5': 'Näet ottelun tilastot',
  '7': 'Maalitapahtumat tallentuvat aikaleimoilla',
  '7.2': 'Lisää muistiinpanoja kirjoittaen tai nauhoittaen',
  '7.4': 'Merkitse toteutuneet pelipaikat',
  '7.6': 'Kirjoita tai sanele otteluraportti',
  '8': 'Saat luotua ottelusta koosteen tai pöytäkirjan',
  '9': 'Tulos, tilastot ja kausi päivittyvät itsestään.',
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'captions.json'), JSON.stringify(CAPTIONS, null, 1));

const S = loadStates(path.join(ROOT, 'out', 'demo-backup.json'));
const rec = await openRecorder({ outDir: OUT });

// Front page -> the game opens on an empty pitch -> the formation picker lays out 2-1-2-1-1 -> two discs dragged onto each other swap.
await rec.scene('front', S.basicFront, { only }, async ({ page, arm, tap, touchTap, glide, hold, mark, orbit }) => {
  const card = page.getByRole('button', { name: /Rantakylän FC/ }).first();
  mark(1); await hold(900); await orbit(card); await hold(800);
  mark(2); await tap(card, 700); await page.getByRole('button', { name: 'Avaa ajastin' }).waitFor({ timeout: 90000 }); await arm(); await hold(1600);
  await tap(page.getByTestId('tour-formation'), 600); await hold(900);
  // the 8v8 presets sit below the sheet's fold, under the control bar: bring the item to the middle first
  const preset = page.getByRole('menuitem', { name: /2-1-2-1-1/ }).first();
  await preset.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' })); await hold(1000);
  await tap(preset, 700); await hold(2400);
  // the preset fills SLOTS in order; on a phone a swap is tap one disc, tap the other: the wingers, then the attacking midfielder and the striker
  const b = await page.getByTestId('soccer-field').boundingBox(); const at = (k) => [b.x + SLOTS[k][0] * b.width, b.y + SLOTS[k][1] * b.height];
  await touchTap(...at(4), 500); await touchTap(...at(5), 1400); await touchTap(...at(6), 500); await touchTap(...at(7), 1400);
  await hold(1400);
  await glide(page.getByRole('button', { name: 'Avaa ajastin' }), 1400, 1800); await hold(400);
});

// One continuous clock: start, a goal, the interval reminder turning due and being cleared, then Viimeistele ottelu and the recap.
await rec.scene('timer', S.basicTimer, { inMatch: true, startCur: [195, 815], only }, async ({ page, arm, tap, glide, hold, mark, pickFromSelect, scrollToHeading, scrollToId }) => {
  await hold(400); await tap(page.getByRole('button', { name: 'Avaa ajastin' }), 200); await hold(900); await arm();
  mark(3); await tap(page.getByRole('button', { name: 'Käynnistä' })); await hold(2600);
  mark(4); await tap(page.getByRole('button', { name: 'Kirjaa maali' }).first()); await hold(900); await arm();
  await pickFromSelect('#scorerSelect', pid(10)); await pickFromSelect('#assisterSelect', pid(7));
  await tap(page.getByTestId('tour-confirm-goal'), 500); await hold(2200);
  await tap(page.getByRole('button', { name: 'Vastustaja +1' }).first(), 500); await hold(700); await arm();
  await tap(page.getByRole('button', { name: 'Vahvista' }).first(), 500); await hold(2200);
  mark(5); await page.locator('.text-red-400').first().waitFor({ timeout: 30000 }).catch(() => {}); await hold(600);
  await glide(page.locator('.text-red-400').first(), 1800); await hold(400);
  await tap(page.getByRole('button', { name: 'Vaihto tehty' }).first(), 600); await hold(3000);
  mark(5.5); await tap(page.getByRole('button', { name: 'Valikko', exact: true }), 500); await hold(900); await arm();
  await tap(page.getByRole('button', { name: 'Viimeistele ottelu' }).first(), 600); await hold(1400); await arm();
  mark(6); await scrollToHeading('Tarkistuslista'); await hold(3000);
  mark(6.5); await scrollToHeading('Pelaajatilastot'); await hold(3000);
  mark(7); await scrollToHeading('Maaliloki|Goal Log'); await hold(3000);
  mark(7.2); await scrollToId('game-notes-step'); await hold(3000);
  mark(7.4); await scrollToId('positions-editor'); await hold(3000);
  mark(7.6); await scrollToId('game-report-editor'); await hold(3000);
  mark(8); await scrollToHeading('Jaa ottelukooste'); await hold(800);
  await tap(page.getByRole('button', { name: /kooste/i }).first(), 700); await hold(6000);
});

// The closing Home view: the result on the card, then the season's stats tab with today's goal in it.
await rec.scene('after', S.basicPlayed, { only }, async ({ page, tap, mark, hold }) => { mark(9); await hold(3200); await tap(page.getByRole('tab', { name: 'Tilastot' }).first(), 600); await hold(3600); });
await rec.close();
