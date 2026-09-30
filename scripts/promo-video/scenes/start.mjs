/**
 * "Aloitus alle minuutissa": the real first run. Create the account, name the team, add the
 * players, land on Home. Recorded in cloud mode against the dev server's STAGING backend with a
 * throwaway synthetic account (staging auto-confirms sign-ups); delete those accounts afterwards.
 *
 * Usage: node scenes/start.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { openRecorder } from '../lib/recorder.mjs';
import { pid, PRESENT } from '../lib/seeds.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = path.join(ROOT, 'out', 'start');

export const CAPTIONS = {
  '1': 'Luo tili ja vahvista sähköpostiosoitteesi.',
  '2': 'Nimeä joukkueesi ja valitse pelimuodostelma.',
  '3': 'Lisää pelaajat yksitellen.',
  '4': 'Joukkueesi on valmis. Seuraavaksi ensimmäinen ottelu.',
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'captions.json'), JSON.stringify(CAPTIONS, null, 1));

const roster = JSON.parse(fs.readFileSync(path.join(ROOT, 'out', 'demo-backup.json'), 'utf8')).localStorage.soccerMasterRoster;
const NAMES = PRESENT.map((n) => roster.find((p) => p.id === pid(n)).name);
// A clean address for the camera; delete the account after every run (see README) or the next sign-up fails.
const EMAIL = 'mepa.valmentaja@example.com'; const PASSWORD = 'Pallokentta-2026';

const rec = await openRecorder({ outDir: OUT });
await rec.scene('start', null, { cloud: true, startCur: [195, 780] }, async ({ page, arm, tap, type, hold, mark, orbit }) => {
  mark(1); await hold(1200);
  await type(page.locator('input[type=email]').first(), EMAIL); await hold(300);
  const pw = page.locator('input[type=password]'); await type(pw.nth(0), PASSWORD); await type(pw.nth(1), PASSWORD); await hold(300);
  await tap(page.locator('input[type=checkbox]').first(), 500); await hold(600);
  await tap(page.getByRole('button', { name: 'Luo tili' }).last(), 600);
  await page.getByTestId('wizard-team-name').waitFor({ timeout: 90000 }); await arm(); await hold(1200);
  mark(2); await type(page.getByTestId('wizard-team-name'), 'MePa'); await hold(500);
  await tap(page.getByTestId('wizard-format-8v8'), 600); await hold(900);
  await tap(page.getByTestId('wizard-continue'), 600); await page.getByTestId('wizard-player-input').waitFor(); await arm(); await hold(900);
  mark(3); const input = page.getByTestId('wizard-player-input'); await tap(input, 300);
  for (const n of NAMES) { await input.pressSequentially(n, { delay: 45 }); await input.press('Enter'); await hold(220); }
  await hold(1200); await tap(page.getByTestId('wizard-finish'), 700);
  await page.getByText('Kaikki valmista').first().waitFor({ timeout: 90000 }); await arm(); await hold(600);
  mark(4); await hold(1800); await orbit(page.getByRole('button', { name: 'Uusi ottelu' }).first()); await hold(1800);
  console.log('account', EMAIL);
});
await rec.close();
