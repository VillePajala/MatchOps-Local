/**
 * "Luo ottelu": from the empty Home to the front-page card with the departure time. Team pick fills
 * the roster and the season; the venue is created from a name and a map address; the starting point
 * is set once from the card's own prompt. Local mode, seeded from the demo club with no matches.
 *
 * Usage: node scenes/create.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { openRecorder } from '../lib/recorder.mjs';
import { freshState } from '../lib/seeds.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = path.join(ROOT, 'out', 'create');

export const CAPTIONS = {
  '1': 'Valitse luomasi joukkue.',
  '2': 'Kirjoita vastustajan nimi. Nimet tallentuvat uudelleenkäyttöä varten.',
  '3': 'Pelimuodostelma, päivämäärä, kellonaika sekä onko peli koti- vai vierasottelu.',
  '4': 'Nimeä sijainti ja hae osoite. Ajo-ohjeet löytävät perille.',
  '5': 'Ottelu avautuu kenttänäkymään.',
  '6': 'Etusivu näyttää nyt seuraavan pelin tiedot.',
  '7': 'Aseta oletuslähtöpaikka kerran sovellukseen lähtöajan laskentaa varten.',
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'captions.json'), JSON.stringify(CAPTIONS, null, 1));

const S = freshState(path.join(ROOT, 'out', 'demo-backup.json'));
const rec = await openRecorder({ outDir: OUT });

/** Type into a search field and pick the first suggestion once the list has answered. */
const pickAddress = async ({ page, type, tap, hold }, id, text) => {
  await type(page.locator(`#${id}`), text);
  const opt = page.locator(`#${id}-results [role=option]`).first(); await opt.waitFor({ timeout: 15000 }); await hold(700);
  await tap(opt, 400); await hold(900);
};

await rec.scene('create', S, { startCur: [195, 430] }, async (h) => {
  const { page, arm, tap, type, hold, mark, pickFromSelect, orbit } = h;
  mark(1); await hold(900); await tap(page.getByTestId('tour-new-game'), 500); await hold(1200); await arm();
  await pickFromSelect('#teamSelectTop', 'team_demo_mepa'); await hold(2200);
  mark(2); await type(page.locator('#opponentNameInput'), 'Rantakylän FC'); await hold(1600);
  mark(3); const formationValue = await page.locator('#formationSelect option', { hasText: /^2-1-2-1-1$/ }).getAttribute('value');
  await pickFromSelect('#formationSelect', formationValue); await hold(500);
  const date = page.locator('#gameDateInput'); await tap(date, 300); await date.fill('2026-10-03'); await hold(700);
  await type(page.locator('input[placeholder="HH"]').first(), '13'); await type(page.locator('input[placeholder="MM"]').first(), '00'); await hold(400);
  await tap(page.getByRole('button', { name: 'Vieras' }).first(), 400); await hold(1200);
  mark(4); const name = page.locator('#gameLocationInput'); await tap(name, 300); await name.fill(''); await name.pressSequentially('Ukonniemen tekonurmi', { delay: 55 }); await hold(900);
  const asNew = page.getByRole('option').filter({ hasText: 'Käytä nimeä' }).first(); if (await asNew.count()) { await tap(asNew, 300); await hold(500); }
  await pickAddress(h, 'gameLocationInput-address', 'Ottelukatu, Imatra'); await hold(1200);
  mark(5); await tap(page.getByRole('button', { name: 'Luo ottelu' }).first(), 500);
  await page.getByRole('button', { name: 'Avaa ajastin' }).waitFor({ timeout: 90000 }); await arm(); await hold(3200);
  mark(6); await tap(page.getByRole('button', { name: 'Valikko', exact: true }), 500); await hold(900); await arm();
  await tap(page.getByRole('button', { name: /^Koti$/ }).first(), 500); await page.getByText(/Seuraava ottelu/i).first().waitFor({ timeout: 90000 }); await arm(); await hold(2600);
  mark(7); await tap(page.getByText('Aseta lähtöpaikka').first(), 500); await page.locator('#starting-point').waitFor({ timeout: 30000 }); await arm(); await hold(800);
  await type(page.locator('#starting-point'), 'Koti'); await hold(700);
  const asHome = page.getByRole('option').filter({ hasText: 'Käytä nimeä' }).first(); if (await asHome.count()) { await tap(asHome, 300); await hold(400); }
  await pickAddress(h, 'starting-point-address', 'Kauppakatu 35, Lappeenranta'); await hold(800);
  await tap(page.getByRole('button', { name: 'Valmis', exact: true }).first(), 500); await page.getByText(/Lähtö\s*\d/).first().waitFor({ timeout: 30000 }); await arm(); await hold(1500);
  await orbit(page.getByRole('button', { name: /Rantakylän FC/ }).first()); await hold(2200);
});
await rec.close();
