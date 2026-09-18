/**
 * @jest-environment jsdom
 * @critical - REGRESSION. The address field is controlled by the locationAddress
 * prop. ModalManager never passed it to GameSettingsModal, so in Ottelutiedot
 * the field was permanently empty: every keystroke was reverted on the next
 * render and the street address could not be typed at all.
 */
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/components/HomePage/containers/ModalManager.tsx'),
  'utf8',
);

/** The props handed to one JSX element, by component name. */
const propsOf = (component: string) => {
  const start = source.indexOf(`<${component}`);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('/>', start));
};

describe('GameSettingsModal receives the whole location', () => {
  const props = propsOf('GameSettingsModal');

  /**
   * All three travel together or the field they feed contradicts itself: the
   * pin without its address cannot be shown, and the address without the pin
   * cannot be typed.
   */
  it.each(['locationLat', 'locationLng', 'locationAddress'])('passes %s', (prop) => {
    expect(props).toContain(`${prop}={data.gameSessionState.${prop}}`);
  });

  /**
   * Editing a match's location needs the venue book as much as creating one
   * does - a venue the map cannot find is findable ONLY from the book, and
   * Ottelutiedot was the one place it never reached.
   */
  it('passes the venue book', () => {
    expect(props).toContain('knownVenues={knownVenues}');
    expect(source).toContain('buildVenueBook(Object.values(data.savedGames ?? {}))');
  });
});

describe('the session carries the address alongside the coordinates', () => {
  const reducer = fs.readFileSync(
    path.join(process.cwd(), 'src/hooks/useGameSessionReducer.ts'),
    'utf8',
  );

  it('has somewhere to keep it', () => {
    expect(reducer).toContain('locationAddress?: string;');
  });

  it('restores it when a saved game is loaded', () => {
    expect(reducer).toContain('const locationAddress = loadedData.locationAddress;');
  });
});
