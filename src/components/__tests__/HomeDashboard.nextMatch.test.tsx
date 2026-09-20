/**
 * @jest-environment jsdom
 * @critical - the two rules the owner settled: there is always a top card, and
 * the accent appears only when it has a job to do.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HomeDashboard } from '@/components/HomeDashboard';
import type { HomeSummary } from '@/utils/homeSummary';

/**
 * Interpolates EVERY variable, not only {{count}}. The narrower version let a
 * label carrying {{time}} render the placeholder literally and still pass.
 */
const t = ((k: string, d?: string | Record<string, unknown>, o?: Record<string, unknown>) => {
  const fallback = typeof d === 'string' ? d : k;
  const vars = { ...(typeof d === 'object' ? d : {}), ...(o ?? {}) } as Record<string, unknown>;
  return fallback.replace(/\{\{(\w+)\}\}/g, (m, key: string) =>
    vars[key] === undefined ? m : String(vars[key]),
  );
}) as unknown as Parameters<typeof HomeDashboard>[0]['t'];

const base = (over: Partial<HomeSummary> = {}): HomeSummary => ({
  resume: null,
  vuosi: null,
  recent: [],
  upcoming: null,
  lastPlayed: null,
    upcomingList: [],
  counts: { players: 0, teams: 0, personnel: 0, seasons: 0, tournaments: 0 },
  countsReady: true,
  topScorer: null,
  ...over,
});

const resume = { id: 'open', opponent: 'HJK', ourScore: 1, theirScore: 0, homeOrAway: 'away' as const, isPlayed: true, mapsUrl: null };
const recent = (id: string, opponent: string) => ({ id, opponent, ourScore: 1, theirScore: 0, result: 'W' as const, date: '2026-09-14', isFriendly: false });
const fixture = (over = {}) => ({ id: 'next', opponent: 'Purppura', date: '2026-09-20', time: '14:00', venue: 'Kimpisen kenttä', fieldNumber: 'TN 2', mapsUrl: null, daysAway: 3, travel: null, ...over });

describe('the top slot is never empty', () => {
  it('shows the fixture when one is booked', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture(), resume })} t={t} />);

    expect(screen.getByText(/Next match/)).toBeInTheDocument();
    expect(screen.getByText('Purppura')).toBeInTheDocument();
  });

  /** The owner's requirement: the Jatka card keeps the slot when nothing is booked. */
  it('falls back to the last-opened match when nothing is booked', () => {
    render(<HomeDashboard summary={base({ resume })} t={t} />);

    expect(screen.queryByText(/Next match/)).toBeNull();
    expect(screen.getByText('HJK')).toBeInTheDocument();
  });

  it('shows the fixture in preference to the open match', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture(), resume })} t={t} />);

    // One card, and it is the fixture - not both.
    expect(screen.getByText('Purppura')).toBeInTheDocument();
    expect(screen.queryByText(/Continue/)).toBeNull();
  });
});

describe('the countdown', () => {
  it.each([
    [0, 'Today'],
    [1, 'Tomorrow'],
    [3, '3 d'],
  ])('reads %i days away as %s', (daysAway, label) => {
    render(<HomeDashboard summary={base({ upcoming: fixture({ daysAway }) })} t={t} />);

    expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
  });
});

describe('the accent', () => {
  /** Wayfinding: your last match is down here, because the card above is not it. */
  it('marks the last-opened match while the fixture holds the slot', () => {
    render(<HomeDashboard summary={base({
      upcoming: fixture(),
      resume,
      recent: [recent('open', 'HJK'), recent('older', 'Ojk')],
    })} t={t} />);

    const marked = screen.getByRole('button', { name: /HJK/ });
    expect(marked.className).toContain('amber');
  });

  /**
   * The rule the owner asked about: with the Jatka card up, the accent would be
   * the app saying the same sentence twice in one glance.
   */
  it('disappears when the top card is already showing that match', () => {
    render(<HomeDashboard summary={base({
      resume,
      recent: [recent('open', 'HJK'), recent('older', 'Ojk')],
    })} t={t} />);

    const cards = screen.getAllByRole('button', { name: /HJK/ });
    expect(cards.every((c) => !c.className.includes('amber'))).toBe(true);
  });

  it('never marks a match that is not the one you had open', () => {
    render(<HomeDashboard summary={base({
      upcoming: fixture(),
      resume,
      recent: [recent('older', 'Ojk')],
    })} t={t} />);

    expect(screen.getByRole('button', { name: /Ojk/ }).className).not.toContain('amber');
  });
});

describe('the venue on the card', () => {
  /**
   * Games saved before the label was shortened kept the whole disambiguation
   * string, which truncated mid-word on the card - the owner's read
   * "Savitaipale Areena, Jonni Myyrän tie 3, Savitai…".
   */
  it('shows the venue without its stored address tail', () => {
    render(<HomeDashboard summary={base({
      upcoming: fixture({ venue: 'Savitaipale Areena, Jonni Myyrän tie 3, Savitaipale', fieldNumber: undefined }),
    })} t={t} />);

    expect(screen.getByText('Savitaipale Areena')).toBeInTheDocument();
  });

  it('keeps the pitch beside it', () => {
    render(<HomeDashboard summary={base({
      upcoming: fixture({ venue: 'Kimpisen kenttä, Lappeenranta', fieldNumber: 'TN 2' }),
    })} t={t} />);

    expect(screen.getByText('Kimpisen kenttä')).toBeInTheDocument();
    expect(screen.getByText('TN 2')).toBeInTheDocument();
  });

  it('says nothing when there is no venue at all', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture({ venue: undefined, fieldNumber: undefined }) })} t={t} />);

    expect(screen.getByText('Purppura')).toBeInTheDocument();
  });
});

describe('the strip', () => {
  it('offers the toggle only when there are both kinds', () => {
    const { rerender } = render(<HomeDashboard summary={base({ recent: [recent('a', 'HJK')] })} t={t} />);
    expect(screen.queryByRole('tab')).toBeNull();

    rerender(<HomeDashboard summary={base({
      recent: [recent('a', 'HJK')],
      upcoming: fixture(),
      lastPlayed: null,
    upcomingList: [fixture()],
    })} t={t} />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('defaults to the fixtures when any exist', () => {
    render(<HomeDashboard summary={base({
      recent: [recent('a', 'HJK')],
      upcoming: fixture(),
      lastPlayed: null,
    upcomingList: [fixture()],
    })} t={t} />);

    const upcomingTab = screen.getByRole('tab', { name: /Upcoming/ });
    expect(upcomingTab.getAttribute('aria-selected')).toBe('true');
  });
});

describe('which strip the toggle opens on', () => {
  const twoFixtures = [fixture({ id: 'a' }), fixture({ id: 'b', opponent: 'KuPS' })];

  it('opens on the fixtures when any are booked', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture(), lastPlayed: null,
    upcomingList: twoFixtures, recent: [recent('r1', 'FC Espoo')] })} t={t} />);

    expect(screen.getByText('KuPS')).toBeInTheDocument();
    expect(screen.queryByText('FC Espoo')).toBeNull();
  });

  /**
   * The default has to be DERIVED, not stored at mount. Booking the season's
   * first fixture without leaving Home used to leave the coach on Tulokset,
   * because the initial value had been frozen when no fixtures existed.
   */
  it('switches to the fixtures when the first one is booked mid-session', () => {
    const { rerender } = render(
      <HomeDashboard summary={base({ recent: [recent('r1', 'FC Espoo')] })} t={t} />,
    );
    expect(screen.getByText('FC Espoo')).toBeInTheDocument();

    rerender(
      <HomeDashboard
        summary={base({ upcoming: fixture(), lastPlayed: null,
    upcomingList: twoFixtures, recent: [recent('r1', 'FC Espoo')] })}
        t={t}
      />,
    );

    expect(screen.getByText('KuPS')).toBeInTheDocument();
  });
});

describe('when to leave', () => {
  const travel = (over = {}) => ({
    departure: '15:45', arriveBy: '16:45', travelMinutes: 60,
    isEstimate: false, distanceKm: 87, departsPreviousDay: false, ...over,
  });

  it('tells the coach when to set off', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture({ travel: travel() }) })} t={t} />);

    expect(screen.getByText(/Leave 15:45/)).toBeInTheDocument();
  });

  /**
   * A straight-line guess about roads it has never seen is not a promise, but
   * the word "arvio" and a pair of brackets were most of the line. One
   * character carries the same hedge.
   */
  it('marks a guessed drive with a tilde', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture({ travel: travel({ isEstimate: true }) }) })} t={t} />);

    expect(screen.getByText(/~1 h/)).toBeInTheDocument();
  });

  it('drops the tilde once the coach has driven it', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture({ travel: travel() }) })} t={t} />);

    expect(screen.queryByText(/~/)).toBeNull();
    expect(screen.getByText(/1 h/)).toBeInTheDocument();
  });

  it('says nothing about estimates in words', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture({ travel: travel({ isEstimate: true }) }) })} t={t} />);

    expect(screen.queryByText(/estimate/)).toBeNull();
    expect(screen.queryByText(/\(/)).toBeNull();
  });

  it('says nothing at all when it cannot be worked out', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture({ travel: null }) })} t={t} />);

    expect(screen.queryByText(/Leave /)).toBeNull();
  });
});

describe('adjusting the journey from the card', () => {
  const travel = (over = {}) => ({
    departure: '15:45', arriveBy: '16:45', travelMinutes: 60, arrivalBufferMinutes: 45,
    isEstimate: true, distanceKm: 87, departsPreviousDay: false, ...over,
  });

  const open = async (over = {}) => {
    const onAdjustTravel = jest.fn();
    render(
      <HomeDashboard
        summary={base({ upcoming: fixture({ travel: travel(over) }) })}
        onAdjustTravel={onAdjustTravel}
        t={t}
      />,
    );
    await userEvent.click(screen.getByText(/Leave 15:45/));
    return { onAdjustTravel };
  };

  it('is closed until the departure line is tapped', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture({ travel: travel() }) })} t={t} />);

    expect(screen.queryByText(/At the ground before kick-off/)).toBeNull();
  });

  /**
   * A cup tie asking for an hour must not force the coach to change the club
   * default and remember to change it back.
   */
  it('sets this match s own arrival buffer', async () => {
    const { onAdjustTravel } = await open();

    await userEvent.click(screen.getByRole('button', { name: '60 min' }));

    expect(onAdjustTravel).toHaveBeenCalledWith('next', { arrivalBufferMinutes: 60 });
  });

  it('shows which buffer is currently in force', async () => {
    await open();

    expect(screen.getByRole('button', { name: '45 min' })).toHaveClass('bg-amber-500');
  });

  /** The measured drive is what turns the estimate into a real number. */
  it('takes the drive time the coach actually measured', async () => {
    const { onAdjustTravel } = await open();

    const field = screen.getByLabelText(/How long the drive really takes/);
    await userEvent.clear(field);
    await userEvent.type(field, '90');
    await userEvent.tab();

    expect(onAdjustTravel).toHaveBeenCalledWith('next', { travelMinutes: 90 });
  });

  it('ignores a cleared drive time rather than saving a zero', async () => {
    const { onAdjustTravel } = await open();

    const field = screen.getByLabelText(/How long the drive really takes/);
    await userEvent.clear(field);
    await userEvent.tab();

    expect(onAdjustTravel).not.toHaveBeenCalledWith('next', expect.objectContaining({ travelMinutes: expect.anything() }));
  });
});

describe('how the drive reads', () => {
  const travelOf = (minutes: number) => ({
    departure: '15:45', arriveBy: '16:45', travelMinutes: minutes, arrivalBufferMinutes: 30,
    isEstimate: true, distanceKm: 87, departsPreviousDay: false,
  });

  /** "132 min" has to be divided in the head before it means anything. */
  it('says hours and minutes for a long drive', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture({ travel: travelOf(132) }) })} t={t} />);

    expect(screen.getByText(/2 h 12 min/)).toBeInTheDocument();
    expect(screen.queryByText(/132 min/)).toBeNull();
  });

  it('leaves a short drive in minutes', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture({ travel: travelOf(45) }) })} t={t} />);

    expect(screen.getByText(/45 min/)).toBeInTheDocument();
  });
});


/**
 * @critical - the owner asked for this twice. "A fixture, or failing that the
 * last match you had open" leaves a third case: both gone at once. Delete the
 * only booked fixture while the match you last opened was that same one, and
 * Home's most prominent element simply vanished.
 */
describe('the top slot is never empty', () => {
  const lastPlayed = {
    id: 'last', opponent: 'FC Espoo', ourScore: 3, theirScore: 1,
    homeOrAway: 'home' as const, isPlayed: true, mapsUrl: null,
  };

  /**
   * @critical - the owner asked for this twice. Deleting the only fixture
   * when it was also the match you last had open left Home's most prominent
   * element gone entirely.
   */
  it('falls back to the latest match played, with the same action', () => {
    const onOpenGame = jest.fn();
    render(<HomeDashboard summary={base({ lastPlayed })} onOpenGame={onOpenGame} t={t} />);

    expect(screen.getByText('FC Espoo')).toBeInTheDocument();
    expect(screen.getByText(/Continue/)).toBeInTheDocument();
  });

  it('opens that match when the card is pressed', async () => {
    const onOpenGame = jest.fn();
    render(<HomeDashboard summary={base({ lastPlayed })} onOpenGame={onOpenGame} t={t} />);

    await userEvent.click(screen.getByText('FC Espoo'));

    expect(onOpenGame).toHaveBeenCalledWith('last');
  });

  /** A fixture and a match in progress both outrank it. */
  it.each([
    ['a fixture', { upcoming: fixture(), lastPlayed }],
    ['a match to resume', { resume, lastPlayed }],
  ])('stays out of the way when there is %s', (_case, over) => {
    render(<HomeDashboard summary={base(over)} t={t} />);

    expect(screen.queryByText('FC Espoo')).toBeNull();
  });

  describe('and when there is genuinely nothing', () => {
    it('offers the first match', () => {
      render(<HomeDashboard summary={base()} t={t} />);

      expect(screen.getByText(/No matches yet/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /New Game/ })).toBeInTheDocument();
    });

    it('starts one', async () => {
      const onNewGame = jest.fn();
      render(<HomeDashboard summary={base()} onNewGame={onNewGame} t={t} />);

      await userEvent.click(screen.getByRole('button', { name: /New Game/ }));

      expect(onNewGame).toHaveBeenCalled();
    });

    /** Never shown while any real match could take the slot. */
    it('is not reached once a match exists', () => {
      render(<HomeDashboard summary={base({ lastPlayed })} t={t} />);

      expect(screen.queryByText(/No matches yet/)).toBeNull();
    });
  });
});

/**
 * @critical - a key that does not exist falls back to the inline English, so
 * the FI build silently shows English and nothing fails. Two were doing
 * exactly that: the new-game button and the competitions heading.
 */
describe('every translation key on this screen exists', () => {
  const source = require('fs').readFileSync(
    require('path').join(process.cwd(), 'src/components/HomeDashboard.tsx'),
    'utf8',
  );
  const en = require('../../../public/locales/en/common.json');

  const lookup = (key: string) =>
    key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en);

  it.each([...new Set([...source.matchAll(/t\('([\w.]+)'/g)].map((m: RegExpMatchArray) => m[1]))])(
    '%s',
    (key) => {
      // i18next resolves a count-bearing key through its _one / _other forms,
      // so a bare miss is only a miss when neither plural exists either.
      const resolved = lookup(key) ?? lookup(`${key}_other`);
      expect(typeof resolved).toBe('string');
    },
  );
});

/**
 * The Jatka card and the fixture card take the same slot and are both "the
 * match this screen is about", so one carrying only an opponent and a score
 * read as a different kind of thing than the other.
 */
describe('the Jatka card carries when and where too', () => {
  const full = {
    ...resume,
    date: '2026-09-20', time: '14:00',
    venue: 'Mitta-Keittiöt Areena', venueTown: 'Savonlinna', fieldNumber: 'TN 2',
  };

  it('shows the date and kick-off', () => {
    render(<HomeDashboard summary={base({ resume: full })} t={t} />);

    expect(screen.getByText(/20\.9\./)).toBeInTheDocument();
    expect(screen.getByText(/14:00/)).toBeInTheDocument();
  });

  it('shows the venue, its town and the pitch', () => {
    render(<HomeDashboard summary={base({ resume: full })} t={t} />);

    expect(screen.getByText('Mitta-Keittiöt Areena')).toBeInTheDocument();
    expect(screen.getByText('Savonlinna')).toBeInTheDocument();
    expect(screen.getByText('TN 2')).toBeInTheDocument();
  });

  /** A bare match must stay a bare card, not grow an empty line. */
  it('adds nothing when none of it is set', () => {
    render(<HomeDashboard summary={base({ resume })} t={t} />);

    expect(screen.queryByText(/·/)).toBeNull();
  });

  it('shows what it has when only some of it is set', () => {
    render(<HomeDashboard summary={base({ resume: { ...resume, date: '2026-09-20' } })} t={t} />);

    expect(screen.getByText(/20\.9\./)).toBeInTheDocument();
  });
});

describe('the strip cards show the town', () => {
  it('puts it on a recent result', () => {
    render(<HomeDashboard summary={base({
      recent: [{ ...recent('r1', 'FC Espoo'), venueTown: 'Savonlinna' }],
    })} t={t} />);

    expect(screen.getByText('Savonlinna')).toBeInTheDocument();
  });

  it('puts it on an upcoming fixture', () => {
    render(<HomeDashboard summary={base({
      upcoming: fixture(),
      upcomingList: [fixture({ id: 'u2', opponent: 'KuPS', venueTown: 'Mikkeli' })],
      recent: [recent('r1', 'FC Espoo')],
    })} t={t} />);

    expect(screen.getByText('Mikkeli')).toBeInTheDocument();
  });

  /** No pinned venue, no town, no empty line. */
  it('leaves the card as it was when there is no town', () => {
    render(<HomeDashboard summary={base({ recent: [recent('r1', 'FC Espoo')] })} t={t} />);

    expect(screen.getByText('FC Espoo')).toBeInTheDocument();
  });
});

/**
 * ONE SKELETON (owner, 2026-09-19): the fixture card and the Jatka card had
 * grown different shapes in the same slot. These pin the composition the
 * owner approved from a mock - and the two things it removed.
 */
describe('the top card composition', () => {
  const played = {
    id: 'g', opponent: 'PePo / Musta', ourScore: 5, theirScore: 3, homeOrAway: 'away' as const,
    isPlayed: true, mapsUrl: 'https://maps.example/x', date: '2026-09-20', time: '19:00',
    venue: 'Sammonlahden tekonurmi', venueTown: 'Lappeenranta', fieldNumber: 'TN 2',
  };

  it('names the day of the week in the app language', () => {
    render(<HomeDashboard summary={base({ resume: played })} locale="en" t={t} />);

    expect(screen.getByText(/Sun 20\.9\. 19:00/)).toBeInTheDocument();
  });

  it('defaults to Finnish weekdays, like the app', () => {
    render(<HomeDashboard summary={base({ resume: played })} t={t} />);

    expect(screen.getByText(/su 20\.9\./)).toBeInTheDocument();
  });

  /** "Lappe…" told the coach less than no town at all. */
  it('gives the venue and its town their own lines, so neither truncates', () => {
    render(<HomeDashboard summary={base({ resume: played })} t={t} />);

    const venue = screen.getByText('Sammonlahden tekonurmi');
    const town = screen.getByText('Lappeenranta');
    expect(venue).not.toBe(town);
    expect(venue).not.toContainElement(town);
    expect(venue.className).not.toMatch(/truncate/);
    expect(town.className).not.toMatch(/truncate/);
  });

  it('says which match it is: Latest for a played one, In progress otherwise', () => {
    const { rerender } = render(<HomeDashboard summary={base({ resume: played })} t={t} />);
    expect(screen.getByText(/^Latest/)).toBeInTheDocument();

    rerender(<HomeDashboard summary={base({ resume: { ...played, isPlayed: false } })} t={t} />);
    expect(screen.getByText(/^In progress/)).toBeInTheDocument();
  });

  /** The owner's call: it did not earn its row. */
  it('never says home or away', () => {
    render(<HomeDashboard summary={base({ resume: played })} t={t} />);

    expect(screen.queryByText(/^(Home|Away)$/)).toBeNull();
  });

  /** Directions to a ground you came home from is a button with no job. */
  it('offers directions only while the match is still to be played', () => {
    const { rerender } = render(<HomeDashboard summary={base({ resume: played })} t={t} />);
    expect(screen.queryByRole('link', { name: /Directions/ })).toBeNull();

    rerender(<HomeDashboard summary={base({ resume: { ...played, isPlayed: false } })} t={t} />);
    expect(screen.getByRole('link', { name: /Directions/ })).toHaveAttribute('href', 'https://maps.example/x');
  });

  /** On a fixture the kick-off is the big number, so the eyebrow must not repeat it. */
  it('shows a fixture kick-off exactly once', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture({ time: '14:00' }) })} t={t} />);

    expect(screen.getAllByText(/14:00/)).toHaveLength(1);
  });

  /** No action row: the pill rides the venue row and the whole card resumes. */
  it('keeps the Jatka action pressable', async () => {
    const onResume = jest.fn();
    render(<HomeDashboard summary={base({ resume: played })} onResume={onResume} t={t} />);

    await userEvent.click(screen.getByText(/Continue/));

    expect(onResume).toHaveBeenCalledTimes(1);
  });

  /** Owner, 2026-09-20: the card had grown a row for "Pelattu" and overflowed its slot. */
  it('does not spend a row on whether the match was played', () => {
    render(<HomeDashboard summary={base({ resume: played })} t={t} />);

    expect(screen.queryByText(/^Played$/)).toBeNull();
  });
});

/**
 * The travel row (owner, 2026-09-20): departure on the left, directions on the
 * right - the car used to float in the body, belonging to no row.
 */
describe('the travel row', () => {
  const pinned = (over = {}) => fixture({ mapsUrl: 'https://maps.example/x', ...over });

  it('puts directions at the end of the row, beside the departure time', () => {
    render(<HomeDashboard summary={base({ upcoming: pinned({ travel: travel() }) })} t={t} />);

    const link = screen.getByRole('link', { name: /Directions to the venue/i });
    expect(link).toHaveAttribute('href', 'https://maps.example/x');
    expect(link).toHaveTextContent('Directions');
    expect(screen.getByText(/Leave /)).toBeInTheDocument();
  });

  /** A setting nobody finds is a feature nobody has: offer it where the coach is looking. */
  it('offers to set the starting point when the venue is pinned but nothing says when to leave', async () => {
    const onSetStartingPoint = jest.fn();
    render(<HomeDashboard summary={base({ upcoming: pinned({ travel: null }) })} onSetStartingPoint={onSetStartingPoint} t={t} />);

    await userEvent.click(screen.getByText('Set a starting point'));

    expect(onSetStartingPoint).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /Directions to the venue/i })).toBeInTheDocument();
  });

  it('has no row at all for a venue that was only typed', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture({ mapsUrl: null, travel: null }) })} t={t} />);

    expect(screen.queryByRole('link', { name: /Directions/i })).toBeNull();
    expect(screen.queryByText('Set a starting point')).toBeNull();
  });

  it('keeps the car out of the card body', () => {
    render(<HomeDashboard summary={base({ upcoming: pinned({ travel: travel() }) })} t={t} />);

    const body = screen.getByRole('button', { name: /Purppura/ });
    expect(body.querySelector('a')).toBeNull();
  });
});
