/**
 * @critical - this data tells a coach how long their child's match is and how
 * many players are on the pitch. A number that is merely plausible is worse
 * than no number, so every verbatim string here is checked against the
 * evidence file extracted from Palloliitto's own PDF rather than trusted.
 */
import fs from 'fs';
import path from 'path';
import {
  GAME_FORMATS,
  GAME_FORMATS_SOURCE,
  GAME_FORMATS_GENERAL_NOTES,
  ageGroupToNumber,
  findFormatForAge,
  findFormatForAgeGroup,
} from './gameFormats';

const evidence = fs.readFileSync(
  path.join(process.cwd(), 'src/config/gameFormats.source.txt'),
  'utf8',
);

/** The evidence file keeps the source's own spacing; compare on that basis. */
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const evidenceText = squash(evidence);

describe('gameFormats data matches the published source', () => {
  it('covers every band in the source, in order', () => {
    expect(GAME_FORMATS).toHaveLength(8);
    const labels = GAME_FORMATS.map((f) => f.sourceLabel);
    expect(labels).toEqual([
      'P/T 7 ja nuoremmat',
      'P/T 8-9',
      'P/T 10',
      'P/T 11',
      'P/T 12',
      'P/T 13',
      'P/T 14-16',
      'P/T 17 ja vanhemmat',
    ]);
    labels.forEach((l) => expect(evidenceText).toContain(squash(l)));
  });

  /**
   * The heart of it: nothing in the app may say something the PDF does not.
   * Field sizes are normalised only for the spacing the PDF's text layer
   * carries ("3 v 3", "1,15 -1,5m"), never for content.
   */
  it('every value appears verbatim in the extracted source', () => {
    for (const f of GAME_FORMATS) {
      // The PDF's text layer spaces the format out ("3 v 3"); accept either.
      const spaced = f.fieldSize.split('').join(' ');
      expect(
        evidenceText.includes(f.fieldSize) || evidenceText.includes(spaced),
      ).toBe(true);
      expect(evidenceText).toContain(squash(f.field));
      expect(evidenceText).toContain(squash(f.goal.replace('1,15-1,5m', '1,15 -1,5m')));
      expect(evidenceText).toContain(squash(f.ball));
      expect(evidenceText).toContain(squash(f.playingTimeText));
      f.notes.forEach((n) => expect(evidenceText).toContain(squash(n)));
      if (f.goalNote) expect(evidenceText).toContain(squash(f.goalNote));
      if (f.playersNote) expect(evidenceText).toContain(squash(f.playersNote));
      if (f.ballNote) expect(evidenceText).toContain(squash(f.ballNote));
    }
  });

  it('the general note comes from the source too', () => {
    expect(GAME_FORMATS_GENERAL_NOTES.length).toBeGreaterThan(0);
    GAME_FORMATS_GENERAL_NOTES.forEach((n) =>
      expect(evidenceText.toLowerCase()).toContain(squash(n).toLowerCase()),
    );
  });

  /**
   * @critical - the structured playing time is what any future prompt would
   * act on, so it must not drift from the text a human reads beside it.
   */
  it('structured playing time agrees with the text it was read from', () => {
    for (const f of GAME_FORMATS) {
      if (!f.playingTime) continue;
      const { periods, minutes, clock } = f.playingTime;
      expect(f.playingTimeText).toContain(`${periods} x ${minutes} min`);
      expect(f.playingTimeText).toContain(clock === 'running' ? 'suora' : 'tehokas');
    }
  });

  it('records where it came from, so a reissue can be detected', () => {
    expect(GAME_FORMATS_SOURCE.url).toMatch(/^https:\/\//);
    expect(GAME_FORMATS_SOURCE.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(evidenceText).toContain(GAME_FORMATS_SOURCE.sha256);
    expect(evidenceText).toContain(GAME_FORMATS_SOURCE.url);
  });
});

describe('age band lookup', () => {
  it('covers every age with exactly one band, with no gaps', () => {
    for (let age = 4; age <= 25; age++) {
      const matches = GAME_FORMATS.filter(
        (f) => (f.ageMin === null || age >= f.ageMin) && (f.ageMax === null || age <= f.ageMax),
      );
      expect(matches).toHaveLength(1);
    }
  });

  it('reads the app age groups', () => {
    expect(ageGroupToNumber('U10')).toBe(10);
    expect(ageGroupToNumber('u9')).toBe(9);
    expect(ageGroupToNumber('')).toBeNull();
    expect(ageGroupToNumber(undefined)).toBeNull();
    expect(ageGroupToNumber('Senior')).toBeNull();
  });

  it('maps the ages that changed this season to the right format', () => {
    expect(findFormatForAgeGroup('U7')?.fieldSize).toBe('3v3');
    expect(findFormatForAgeGroup('U8')?.fieldSize).toBe('4v4');
    expect(findFormatForAgeGroup('U9')?.fieldSize).toBe('4v4');
    expect(findFormatForAgeGroup('U10')?.fieldSize).toBe('4v4');
    expect(findFormatForAgeGroup('U11')?.fieldSize).toBe('5v5');
  });

  it('treats the open ends as the source writes them', () => {
    expect(findFormatForAge(4)?.sourceLabel).toBe('P/T 7 ja nuoremmat');
    expect(findFormatForAge(25)?.sourceLabel).toBe('P/T 17 ja vanhemmat');
  });

  /**
   * @edge-case - an unknown or missing age must produce nothing, not the
   * youngest band. Defaulting here would quietly tell a U15 coach they play 3v3.
   */
  it('returns nothing for an unknown age rather than guessing', () => {
    expect(findFormatForAge(null)).toBeNull();
    expect(findFormatForAgeGroup(undefined)).toBeNull();
    expect(findFormatForAgeGroup('not-an-age')).toBeNull();
  });
});
