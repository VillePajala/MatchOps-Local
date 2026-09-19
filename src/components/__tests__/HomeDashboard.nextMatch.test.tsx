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

    expect(screen.getByText('Kimpisen kenttä · TN 2')).toBeInTheDocument();
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
      upcomingList: [fixture()],
    })} t={t} />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('defaults to the fixtures when any exist', () => {
    render(<HomeDashboard summary={base({
      recent: [recent('a', 'HJK')],
      upcoming: fixture(),
      upcomingList: [fixture()],
    })} t={t} />);

    const upcomingTab = screen.getByRole('tab', { name: /Upcoming/ });
    expect(upcomingTab.getAttribute('aria-selected')).toBe('true');
  });
});

describe('which strip the toggle opens on', () => {
  const twoFixtures = [fixture({ id: 'a' }), fixture({ id: 'b', opponent: 'KuPS' })];

  it('opens on the fixtures when any are booked', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture(), upcomingList: twoFixtures, recent: [recent('r1', 'FC Espoo')] })} t={t} />);

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
        summary={base({ upcoming: fixture(), upcomingList: twoFixtures, recent: [recent('r1', 'FC Espoo')] })}
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

  /** A straight-line guess about roads it has never seen is not a promise. */
  it('says when the drive is only a guess', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture({ travel: travel({ isEstimate: true }) }) })} t={t} />);

    expect(screen.getByText(/estimate/)).toBeInTheDocument();
  });

  it('drops the hedge once the coach has driven it', () => {
    render(<HomeDashboard summary={base({ upcoming: fixture({ travel: travel() }) })} t={t} />);

    expect(screen.queryByText(/estimate/)).toBeNull();
    expect(screen.getByText(/1 h drive/)).toBeInTheDocument();
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
