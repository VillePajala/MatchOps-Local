/**
 * "Ottelun asetukset tarkemmin": everything the create video skipped. Repeat last game, the
 * competition link (season with its official league, tournament with its series), age group and
 * sport, prefill from a plan, game time and the friendly toggle, pitch number and personnel. It
 * never creates the match; it ends on the filled form. Local mode, `advancedState` seed.
 *
 * Usage: node scenes/advanced.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { openRecorder } from '../lib/recorder.mjs';
import { advancedState } from '../lib/seeds.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = path.join(ROOT, 'out', 'advanced');

export const CAPTIONS = {
  '1': 'Toista edellinen peli -nappi kopioi edellisen ottelun tiedot.',
  '2': 'Liitä ottelu sarjaan tai turnaukseen tarkkaa tilastointia varten.',
  '3': 'Valitse ikäluokka ja laji.',
  '4': 'Kokoonpanon ja vaihtosuunnitelman voi tuoda halutessaan ottelusuunnittelutyökalusta.',
  '5': 'Aseta peliaika ja puoliajan pituus. Asettamalla peli harjoitusotteluksi se ei näy kilpailutilastoissa.',
  '6': 'Kenttänumero ja taustahenkilöt pöytäkirjaa varten.',
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'captions.json'), JSON.stringify(CAPTIONS, null, 1));

const S = advancedState(path.join(ROOT, 'out', 'demo-backup.json'));
const rec = await openRecorder({ outDir: OUT });

await rec.scene('advanced', S, { startCur: [195, 560] }, async ({ page, arm, tap, type, hold, mark, pickFromSelect }) => {
  const optionValue = async (sel, nth) => page.locator(`${sel} option`).nth(nth).getAttribute('value');
  await hold(600); await tap(page.getByRole('button', { name: 'Uusi ottelu' }).first(), 400); await hold(1200); await arm();
  mark(1); await tap(page.getByRole('button', { name: /Toista edellinen peli/ }).first(), 600); await hold(2800);
  mark(2); await tap(page.getByRole('button', { name: 'Sarja', exact: true }).first(), 500); await hold(700);
  await pickFromSelect('#seasonSelect', 'season_demo_2026'); await hold(900);
  await pickFromSelect('#leagueSelect', await optionValue('#leagueSelect', 1)); await hold(1400);
  await tap(page.getByRole('button', { name: 'Turnaus', exact: true }).first(), 500); await hold(700);
  await pickFromSelect('#tournamentSelect', 'tournament_demo_syksy'); await hold(1800);
  await tap(page.getByRole('button', { name: 'Sarja', exact: true }).first(), 400); await hold(700);
  mark(3); await pickFromSelect('#ageGroupSelect', 'U12'); await hold(900);
  await tap(page.getByRole('button', { name: 'Jalkapallo', exact: true }).first(), 400); await hold(1100);
  mark(4); await pickFromSelect('#prefillPlanSelect', 'plan_demo_syksy'); await hold(700);
  // the plan's game list is the select right after the plan select in document order; it has no id of its own
  await page.evaluate(() => { const sels = [...document.querySelectorAll('select')]; const g = sels[sels.indexOf(document.getElementById('prefillPlanSelect')) + 1]; if (g) g.id = 'prefillGameSelect'; });
  await pickFromSelect('#prefillGameSelect', 'pg1'); await hold(2400);
  mark(5); await pickFromSelect('#numPeriodsSelect', '2'); await hold(500);
  const dur = page.locator('#periodDurationInput'); await tap(dur, 300); await dur.fill(''); await dur.pressSequentially('20', { delay: 90 }); await hold(700);
  await tap(page.getByRole('switch', { name: /Harjoitusottelu/ }).first(), 500); await hold(2200);
  mark(6); await type(page.locator('#fieldNumberInput'), 'TN 1'); await hold(600);
  await tap(page.getByLabel(/Mika Virtanen/).first(), 500); await hold(2600);
});
await rec.close();
