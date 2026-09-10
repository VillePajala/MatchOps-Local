import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import RulesDirectoryModal from './RulesDirectoryModal';
import ruleLinks from '@/config/ruleLinks.json';
import { GAME_FORMATS, GAME_FORMATS_SOURCE } from '@/config/gameFormats';

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback || key).replace(/\{\{(\w+)\}\}/g, (_m: string, n: string) => String(options?.[n] ?? '')),
    // The modal formats the checked-on date for the reader's locale, so the
    // mock has to carry a language the way the real hook does.
    i18n: { language: 'fi' },
  }),
}));

// The viewer is rendered by this modal, so pdfjs must be mocked here too -
// a component test may never reach Palloliitto's CDN.
const getPage = jest.fn(async () => ({
  getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
  render: () => ({ promise: Promise.resolve(), cancel: jest.fn() }),
}));
const getDocument = jest.fn((_opts: unknown) => ({
  promise: Promise.resolve({ numPages: 139, getPage }),
}));
jest.mock(
  'pdfjs-dist',
  () => ({
    __esModule: true,
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: (opts: unknown) => getDocument(opts),
  }),
  { virtual: true },
);

// Mock window.open
const mockWindowOpen = jest.fn();
Object.defineProperty(window, 'open', {
  value: mockWindowOpen,
  writable: true,
});

describe('RulesDirectoryModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Tests that modal returns null when closed
   * @critical
   */
  it('should not render when isOpen is false', () => {
    const { container } = render(
      <RulesDirectoryModal isOpen={false} onClose={jest.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  /**
   * Tests that modal renders correctly when open
   * @critical
   */
  it('should render modal when isOpen is true', () => {
    render(<RulesDirectoryModal {...defaultProps} />);

    // Verify title is present
    expect(screen.getByText('Säännöt')).toBeInTheDocument();

    // Verify section header is present (was "Palloliitto"; the sections are
    // now named by what kind of rule they hold).
    expect(screen.getByText('Lajisäännöt')).toBeInTheDocument();

    // Substring, not the whole string: the footer also carries the
    // links-checked-on date, so the paragraph is two sentences now.
    expect(screen.getByText(/Linkit avautuvat selaimessa/)).toBeInTheDocument();
  });

  /**
   * Tests that onClose is called when Done button is clicked
   * @critical
   */
  it('should call onClose when Done button clicked', () => {
    const onClose = jest.fn();
    render(<RulesDirectoryModal isOpen={true} onClose={onClose} />);

    const doneButton = screen.getByRole('button', { name: /Done/i });
    fireEvent.click(doneButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * Tests that all rule links are rendered
   * @critical
   */
  it('should render every configured rule link', () => {
    render(<RulesDirectoryModal {...defaultProps} />);

    // Driven by the config, so adding a link to ruleLinks.json cannot leave the
    // modal and the CI link check disagreeing about what the app ships.
    for (const link of ruleLinks.links) {
      expect(screen.getByText(link.fallbackLabel)).toBeInTheDocument();
    }
    // Both groups are rendered, not just the rulebooks.
    expect(ruleLinks.links.some((l) => l.group === 'series')).toBe(true);
  });

  /**
   * @critical - a rulebook label that names the wrong year is worse than no
   * label: the app shipped "Jalkapallosäännöt 2025" over a link to the 2026
   * PDF, so the modal told coaches it was handing them last year's rules.
   */
  it('labels each link with the year in its own URL', () => {
    const yearOf = (s: string) => (s.match(/20\d{2}/g) ?? []).join(',');
    for (const link of ruleLinks.links) {
      const inUrl = yearOf(link.url);
      if (!inUrl) continue;
      expect(yearOf(link.fallbackLabel)).toBe(inUrl);
    }
  });

  /**
   * The date is stored ISO so the config stays machine-readable, but a Finnish
   * reader should see 9.9.2026, not a raw config value.
   */
  it('says when the links were last checked, in the reader’s own date format', () => {
    render(<RulesDirectoryModal {...defaultProps} />);
    const localized = new Date(ruleLinks.checkedOn).toLocaleDateString('fi');
    expect(screen.getByText(new RegExp(localized.replace(/\./g, '\\.')))).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(ruleLinks.checkedOn))).not.toBeInTheDocument();
  });

  /**
   * Tests that clicking Soccer Rules link opens correct URL
   * @integration
   */
  it('should call window.open with correct parameters for Soccer Rules', () => {
    render(<RulesDirectoryModal {...defaultProps} />);

    const soccerRulesButton = screen.getByText('Jalkapallosäännöt 2026').closest('button');
    fireEvent.click(soccerRulesButton!);

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://www-assets.palloliitto.fi/62562/1767775686-jalkapallosaannot-2026.pdf',
      '_blank',
      'noopener,noreferrer'
    );
  });

  /**
   * Tests that clicking Futsal Rules link opens correct URL
   * @integration
   */
  it('should call window.open with correct parameters for Futsal Rules', () => {
    render(<RulesDirectoryModal {...defaultProps} />);

    const futsalRulesButton = screen.getByText('Futsalsäännöt 2025-26').closest('button');
    fireEvent.click(futsalRulesButton!);

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://www-assets.palloliitto.fi/62562/1771237342-futsalsaannot-2025-26.pdf',
      '_blank',
      'noopener,noreferrer'
    );
  });

  /**
   * Tests the game-formats link, which replaced the Kaikki Pelaa programme
   * after Palloliitto delisted that PDF and moved the age-group rules into
   * season- and series-specific documents.
   * @integration
   */
  it('should call window.open with correct parameters for the game formats', () => {
    render(<RulesDirectoryModal {...defaultProps} />);

    const formatsButton = screen.getByText('Futsalin viralliset pelimuodot 2026-2027').closest('button');
    fireEvent.click(formatsButton!);

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://www.datocms-assets.com/62562/1786687580-futsalin-viralliset-pelimuodot-2026-2027.pdf',
      '_blank',
      'noopener,noreferrer'
    );
  });

  /**
   * Tests that clicking Palloliitto main page link opens correct URL
   * @integration
   */
  it('should call window.open with correct parameters for Palloliitto main page', () => {
    render(<RulesDirectoryModal {...defaultProps} />);

    const allRulesButton = screen.getByText('Kaikki säännöt ja määräykset').closest('button');
    fireEvent.click(allRulesButton!);

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://www.palloliitto.fi/saannot-maaraykset-ja-ohjeet',
      '_blank',
      'noopener,noreferrer'
    );
  });

  /**
   * @critical - the screen exists to answer "what applies to my age group",
   * and the numbers must be the transcribed ones, not a hand-typed copy that
   * can drift from the source the test suite verifies.
   */
  it('shows every age band from the official formats table', () => {
    render(<RulesDirectoryModal {...defaultProps} />);
    const table = screen.getByTestId('formats-table');
    for (const f of GAME_FORMATS) {
      expect(within(table).getByText(f.sourceLabel)).toBeInTheDocument();
      // getAllBy: several bands legitimately share a playing time.
      expect(within(table).getAllByText(f.playingTimeText).length).toBeGreaterThan(0);
    }
    // The formats a coach is most likely to be surprised by this season.
    expect(within(table).getAllByText('4v4').length).toBe(2);
  });

  /**
   * @critical - the per-age rule notes are where the rules actually DIFFER by
   * age (back-pass not in force, restarts by passing, keeper's release). A
   * table of sizes without them looks complete while omitting the part a coach
   * is most likely to get wrong.
   */
  it('shows the per-age rule notes, not just the measurements', () => {
    render(<RulesDirectoryModal {...defaultProps} />);
    const table = screen.getByTestId('formats-table');
    const withNotes = GAME_FORMATS.filter((f) => f.notes.length > 0);
    expect(withNotes.length).toBe(GAME_FORMATS.length);
    for (const f of withNotes) {
      expect(within(table).getAllByText(f.notes.join(' · ')).length).toBeGreaterThan(0);
    }
    // The one that catches people out: no back-pass rule in the young ages.
    expect(within(table).getAllByText(/palautussääntö ei voimassa/).length).toBeGreaterThan(0);
  });

  /**
   * @critical - these are NATIONAL DEFAULTS. A series may deviate, and its own
   * rules are not available to the app. Dropping this sentence would turn a
   * helpful table into the app confidently stating the wrong period length.
   */
  it('says the formats are national defaults that a series may differ from', () => {
    render(<RulesDirectoryModal {...defaultProps} />);
    // This modal's fallbacks are Finnish, like its title and footer.
    expect(screen.getByText(/valtakunnalliset oletukset ikäluokittain/i)).toBeInTheDocument();
    expect(screen.getByText(/Sarja voi poiketa näistä/i)).toBeInTheDocument();
  });

  /**
   * @critical - the table is futsal-only and most coaches here play football.
   * A generic "game formats" heading would invite a football coach to read
   * futsal's 4v4 as their own, which is the same class of confidently-wrong
   * answer the national-defaults caveat exists to prevent.
   */
  it('names the sport and season it covers, and says football is not included', () => {
    render(<RulesDirectoryModal {...defaultProps} />);
    // Heading names the sport and season, and is NOT identical to the link
    // to the same PDF below it.
    expect(screen.getByRole('heading', { name: `Pelimuodot - futsal ${GAME_FORMATS_SOURCE.season}` })).toBeInTheDocument();
    expect(screen.getByText(/vain futsalia/i)).toBeInTheDocument();
  });

  /**
   * @critical - the reason this screen exists at all now. A coach on the
   * touchline types the word they actually use and gets the law, without
   * scrolling a 139-page PDF.
   */
  it('finds a law by a coach word and opens the book AT that page, in the app', async () => {
    render(<RulesDirectoryModal {...defaultProps} />);
    fireEvent.change(screen.getByTestId('rules-search'), { target: { value: 'kentältäpoisto' } });
    const hits = screen.getByTestId('rules-hits');
    expect(within(hits).getByText(/Sääntö 12/)).toBeInTheDocument();

    fireEvent.click(within(hits).getByText(/Sääntö 12/).closest('button')!);
    // Not window.open: a browser hand-off lands on page 1 on a phone.
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(65));
    expect(mockWindowOpen).not.toHaveBeenCalled();
  });

  it('switches book when the sport changes, and pages differ between them', async () => {
    render(<RulesDirectoryModal {...defaultProps} />);
    fireEvent.click(screen.getByTestId('rules-sport-futsal'));
    fireEvent.change(screen.getByTestId('rules-search'), { target: { value: '12' } });
    fireEvent.click(within(screen.getByTestId('rules-hits')).getByText(/Sääntö 12/).closest('button')!);
    // Futsal's Law 12 is page 41, and it must come from the futsal book.
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(41));
    expect(getDocument).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('futsalsaannot') }),
    );
  });

  /**
   * @critical - the page jump is a desktop PDF-viewer feature; on a phone the
   * book opens at page 1. The screen must therefore show the page number
   * legibly and say so, rather than implying a jump that will not happen.
   */
  it('still shows the page number, which is now a promise it can keep', () => {
    render(<RulesDirectoryModal {...defaultProps} />);
    fireEvent.change(screen.getByTestId('rules-search'), { target: { value: 'paitsio' } });
    const hits = screen.getByTestId('rules-hits');
    expect(within(hits).getByText('s. 61')).toBeInTheDocument();
    expect(screen.getByText(/avautuu suoraan oikealta sivulta/i)).toBeInTheDocument();
  });

  /**
   * @edge-case - sin bin is guidance, not a law, so it takes a different code
   * path to build its link. It shipped once with no test and no null-safety.
   */
  it('opens a guidance section at its own page, with no law number shown', async () => {
    render(<RulesDirectoryModal {...defaultProps} />);
    fireEvent.change(screen.getByTestId('rules-search'), { target: { value: 'sin bin' } });
    const hits = screen.getByTestId('rules-hits');
    const row = within(hits).getByText(/sin bin/i).closest('button')!;
    expect(row.textContent).not.toMatch(/Sääntö \d/);

    fireEvent.click(row);
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(10));
  });

  it('lists all 17 laws before anything is typed, and says so when nothing matches', () => {
    render(<RulesDirectoryModal {...defaultProps} />);
    // 17 laws plus the football-only sin bin guidance entry.
    expect(within(screen.getByTestId('rules-hits')).getAllByRole('button')).toHaveLength(18);
    fireEvent.change(screen.getByTestId('rules-search'), { target: { value: 'zzzznotarule' } });
    expect(screen.getByTestId('rules-no-hits')).toBeInTheDocument();
  });

  /**
   * @critical - the page's job is to say WHERE each kind of rule lives. The
   * per-series numbers (players, playing time, pitch) are not in any document
   * the app can link, so a coach who does not learn they live in Tulospalvelu
   * leaves with the wrong answer or none.
   */
  it('sends the coach to their own series for the rules that are series-specific', () => {
    render(<RulesDirectoryModal {...defaultProps} />);
    expect(screen.getByText('Sarjakohtaiset säännöt')).toBeInTheDocument();
    // Says plainly that the app cannot know which league you are in.
    expect(screen.getByText(/ei ole yhteydessä Palloliiton järjestelmään/i)).toBeInTheDocument();

    const seriesLink = screen.getByText('Selaa sarjoja (Tulospalvelu)').closest('button');
    fireEvent.click(seriesLink!);
    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://tulospalvelu.palloliitto.fi/categories',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('names the three places rules live, so the page reads as a map not a dump', () => {
    render(<RulesDirectoryModal {...defaultProps} />);
    expect(screen.getByText(/kolmessa paikassa/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sarjakohtaiset säännöt' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lajisäännöt' })).toBeInTheDocument();
  });

  /**
   * Tests that all links use security attributes
   * @edge-case
   */
  it('should use noopener,noreferrer for all external links', () => {
    render(<RulesDirectoryModal {...defaultProps} />);

    // Scoped by the LinkButton's own aria-label: the screen now also has
    // sport toggles and law rows, and "every button opens a window" stopped
    // being true when the page gained controls that are not links.
    const linkButtons = screen
      .getAllByRole('button')
      .filter((btn) => /^Open .* in new window$/.test(btn.getAttribute('aria-label') ?? ''));

    expect(linkButtons).toHaveLength(ruleLinks.links.length);

    // Click each link button and verify security params
    linkButtons.forEach(button => {
      mockWindowOpen.mockClear();
      fireEvent.click(button);
      expect(mockWindowOpen).toHaveBeenCalledWith(
        expect.any(String),
        '_blank',
        'noopener,noreferrer'
      );
    });
  });
});
