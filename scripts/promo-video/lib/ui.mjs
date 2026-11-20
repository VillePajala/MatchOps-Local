/**
 * The video's language: VLANG=en records the app in English, with English captions and cards
 * (output under out/<video>/en/, files suffixed -en). Finnish is the default. Every UI label a
 * scene clicks or waits for comes from here, copied from public/locales/<lang>/common.json.
 */
export const LANG = process.env.VLANG === 'en' ? 'en' : 'fi';
const S = {
  fi: { openTimer: 'Avaa ajastin', planner: /^Ottelusuunnittelu/, planName: /^Turnaus /, close: 'Sulje', save: 'Tallenna', matchSheet: 'Pöytäkirja',
    start: 'Käynnistä', startOrResume: /Käynnistä|Jatka/, goalForUs: 'Maali meille', shareReport: 'Jaa otteluraportti', copy: 'Kopioi', formationMenu: 'Muodostelmavalikko',
    openGame: /Avaa ottelu/, reportHeading: 'Otteluraportti', goalLogHeading: 'Maaliloki', resetSubTimer: 'Vaihto tehty', teamName: 'MePa' },
  en: { openTimer: 'Open Timer', planner: /^Match planner/, planName: /^Tournament day/, close: 'Close', save: 'Save', matchSheet: 'Match sheet',
    start: 'Start', startOrResume: /Start|Resume/, goalForUs: 'Goal for us', shareReport: 'Share match report', copy: 'Copy', formationMenu: 'Formation menu',
    openGame: /Open the game|Open the match/, reportHeading: 'Match report', goalLogHeading: 'Goal Log', resetSubTimer: 'Sub done', teamName: 'MePa' },
};
export const ui = S[LANG];
/** Where a video's recordings, captions and renders go: out/<video> for Finnish, out/<video>/en otherwise. */
export const outDirFor = (root, video) => (LANG === 'fi' ? `${root}/out/${video}` : `${root}/out/${video}/${LANG}`);
