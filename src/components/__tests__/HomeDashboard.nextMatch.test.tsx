/**
 * @jest-environment jsdom
 * @critical - the two rules the owner settled: there is always a top card, and
 * the accent appears only when it has a job to do.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { HomeDashboard } from '@/components/HomeDashboard';
import type { HomeSummary } from '@/utils/homeSummary';

const t = ((k: string, d?: string | Record<string, unknown>, o?: Record<string, unknown>) => {
  const fallback = typeof d === 'string' ? d : k;
  const count = (o?.count ?? (typeof d === 'object' ? d?.count : undefined)) as number | undefined;
  return count === undefined ? fallback : fallback.replace('{{count}}', String(count));
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
const fixture = (over = {}) => ({ id: 'next', opponent: 'Purppura', date: '2026-09-20', time: '14:00', venue: 'Kimpisen kenttä', fieldNumber: 'TN 2', mapsUrl: null, daysAway: 3, ...over });

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
