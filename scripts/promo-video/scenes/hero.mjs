/**
 * The hero video: one match from the front page to the recap. Each `mark(id)` starts a
 * captioned clip; ids with a fraction (2.5, 7.5, 9.2 ...) are extra stops inside a scene,
 * and an id with no caption in CAPTIONS becomes an uncaptioned transition clip.
 *
 * Usage: node scenes/hero.mjs [front,timer,after]   (defaults to all three recordings)
 */
import fs from 'node:fs';
import path from 'node:path';
import { openRecorder } from '../lib/recorder.mjs';
import { loadStates, pid } from '../lib/seeds.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = path.join(ROOT, 'out');
const only = process.argv[2] ? process.argv[2].split(',') : null;

export const CAPTIONS = {
  '1': 'Seuraava peli, lähtöaika ja reitti - kaikki etusivulla.',
  '2': 'Suunnittele peluutukset koko turnaukseen yhtenä kokonaisuutena.',
  '2.5': 'Määrittele vaihdot ja niiden ajoitukset valmiiksi',
  '3': 'Näet, miten peliaika jakautuu koko turnauksen aikana.',
  '3.5': 'Näet myös, kuinka pelipaikat jakautuvat ottelukokonaisuuden aikana',
  '4': 'Peli aukeaa suunnitelman mukaisella kokoonpanolla.',
  '5': 'Ottelu alkaa, kello käyntiin.',
  '6': 'Kirjaa maalit ja syötöt reaaliajassa.',
  '7': 'Suunnitellut vaihdot muistuttavat itsestään.',
  '8': 'Tarkistuslista muistuttaa pelin viimeistelytoimenpiteistä',
  '8.5': 'Näet ottelun tilastot',
  '9': 'Maalitapahtumat tallentuvat aikaleimoilla',
  '9.2': 'Lisää muistiinpanoja kirjoittaen tai nauhoittaen',
  '9.4': 'Merkitse toteutuneet pelipaikat',
  '9.6': 'Kirjoita tai sanele otteluraportti',
  '10': 'Saat luotua ottelusta koosteen tai pöytäkirjan',
  '11': 'Tulos, tilastot ja kausi päivittyvät itsestään.',
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'captions.json'), JSON.stringify(CAPTIONS, null, 1));

const S = loadStates(path.join(OUT, 'demo-backup.json'));
const rec = await openRecorder({ outDir: OUT });
const FIELD = '[data-testid="plan-field-backdrop"]';

// Front page -> planner (all three games, both balance views) -> the field of the fixture.
await rec.scene('front', S.front, { only }, async ({ page, arm, tap, glide, hold, mark, orbit, scrollToSelector, scrollPanelTop }) => {
  const showField = (ms) => scrollToSelector(FIELD, 'start', ms);
  mark(1); await hold(900); await orbit(page.getByRole('button', { name: /Rantakylän FC/ }).first()); await hold(800);
  mark(2); await tap(page.getByRole('button', { name: /Ottelusuunnittelu/ }).first(), 700); await hold(1200); await arm();
  const row = page.getByText('Syksyn turnaus', { exact: false }).first(); if (await row.count()) { await tap(row, 600); await hold(1200); } await arm(); await hold(1400);
  await showField(3200); await scrollPanelTop(FIELD);
  mark(2.5); await tap(page.getByRole('button', { name: /Kuusiston/ }).first(), 600); await hold(900); await showField(3200); await scrollPanelTop(FIELD);
  await tap(page.getByRole('button', { name: /Joen Pallo/ }).first(), 600); await hold(2600);
  mark(3); await tap(page.getByRole('tab', { name: 'Tasapaino' }).first(), 700); await hold(3800); await arm();
  mark(3.5); await tap(page.getByRole('tab', { name: 'Pelipaikat' }).first(), 700); await hold(3200);
  // Alueet/Roolit is a segmented control: a tab in some builds, a plain button in others.
  await tap(page.getByRole('tab', { name: 'Roolit' }).or(page.getByRole('button', { name: 'Roolit' })).first(), 600); await hold(3400);
  await tap(page.getByRole('button', { name: 'Sulje' }).first(), 700); await hold(1300); await arm();
  mark(4); await tap(page.getByRole('button', { name: /Rantakylän FC/ }).first(), 700); await page.getByRole('button', { name: 'Avaa ajastin' }).waitFor({ timeout: 90000 }); await arm(); await hold(3400);
  await glide(page.getByRole('button', { name: 'Avaa ajastin' }), 1400, 1800); await hold(400);
});

// One continuous clock: start, a goal, the planned-sub prompt, then straight into Viimeistele ottelu and the recap.
await rec.scene('timer', S.timer, { inMatch: true, startCur: [195, 815], only }, async ({ page, arm, tap, hold, mark, pickFromSelect, scrollToHeading, scrollToId }) => {
  await hold(400); await tap(page.getByRole('button', { name: 'Avaa ajastin' }), 200); await hold(900); await arm();
  mark(5); await tap(page.getByRole('button', { name: 'Käynnistä' })); await hold(2600);
  mark(6); await tap(page.getByRole('button', { name: 'Kirjaa maali' }).first()); await hold(900); await arm();
  await pickFromSelect('#scorerSelect', pid(10)); await pickFromSelect('#assisterSelect', pid(7));
  await tap(page.getByTestId('tour-confirm-goal'), 500); await hold(2600);
  mark(7); await page.getByText('SUUNNITELTU VAIHTO', { exact: false }).first().waitFor({ timeout: 40000 }).catch(() => {}); await hold(2000);
  await tap(page.getByRole('button', { name: 'Selvä' }).first(), 600); await hold(1200);
  await tap(page.getByRole('button', { name: 'Vaihto tehty' }).first(), 600); await hold(3200);
  mark(7.5); await tap(page.getByRole('button', { name: 'Avaa ajastin' }), 500); await hold(1000); await arm();
  await tap(page.getByRole('button', { name: 'Valikko', exact: true }), 500); await hold(900); await arm();
  await tap(page.getByRole('button', { name: 'Viimeistele ottelu' }).first(), 600); await hold(1400); await arm();
  mark(8); await scrollToHeading('Tarkistuslista'); await hold(3000);
  mark(8.5); await scrollToHeading('Pelaajatilastot'); await hold(3000);
  mark(9); await scrollToHeading('Maaliloki|Goal Log'); await hold(3000);
  mark(9.2); await scrollToId('game-notes-step'); await hold(3000);
  mark(9.4); await scrollToId('positions-editor'); await hold(3000);
  mark(9.6); await scrollToId('game-report-editor'); await hold(3000);
  mark(10); await scrollToHeading('Jaa ottelukooste'); await hold(800);
  await tap(page.getByRole('button', { name: /kooste/i }).first(), 700); await hold(6000);
});

// The closing Home view: the match played, the result on the card.
await rec.scene('after', S.played, { only }, async ({ mark, hold }) => { mark(11); await hold(5200); });
await rec.close();
