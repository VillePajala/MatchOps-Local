/**
 * @jest-environment jsdom
 * @critical - the whole point of putting directions on the front page is that a
 * coach presses it on the way out of the door. A dead button there, or a link
 * that swallows the resume tap, is worse than not having it.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { HomeDashboard } from '@/components/HomeDashboard';
import type { HomeSummary } from '@/utils/homeSummary';

const t = ((_k: string, d?: string) => d ?? _k) as unknown as Parameters<typeof HomeDashboard>[0]['t'];

const summary = (mapsUrl: string | null): HomeSummary => ({
  resume: {
    id: 'g1',
    opponent: 'HJK',
    ourScore: 1,
    theirScore: 0,
    homeOrAway: 'away',
    isPlayed: false,
    mapsUrl,
  },
  vuosi: null,
  recent: [],
  upcoming: null,
  lastPlayed: null,
    upcomingList: [],
  counts: { players: 0, teams: 0, personnel: 0, seasons: 0, tournaments: 0 },
  countsReady: true,
  topScorer: null,
});

describe('directions on the resume card', () => {
  it('offers directions when the match has a pinned venue', () => {
    render(<HomeDashboard summary={summary('https://maps.example/x')} t={t} />);

    expect(screen.getByRole('link', { name: /Directions to the venue/i })).toHaveAttribute(
      'href',
      'https://maps.example/x',
    );
  });

  /** A control that cannot work is worse than an absent one on the busiest screen. */
  it('shows nothing at all when the match has no location', () => {
    render(<HomeDashboard summary={summary(null)} t={t} />);

    expect(screen.queryByRole('link', { name: /Directions to the venue/i })).toBeNull();
  });

  /**
   * The card is a button and the link is its SIBLING, because a link inside a
   * button is invalid HTML. This is what that buys: pressing one does not fire
   * the other.
   */
  it('does not resume the match when directions are pressed', () => {
    const onResume = jest.fn();
    render(<HomeDashboard summary={summary('https://maps.example/x')} onResume={onResume} t={t} />);

    fireEvent.click(screen.getByRole('link', { name: /Directions to the venue/i }));

    expect(onResume).not.toHaveBeenCalled();
  });

  it('still resumes when the card itself is pressed', () => {
    const onResume = jest.fn();
    render(<HomeDashboard summary={summary('https://maps.example/x')} onResume={onResume} t={t} />);

    fireEvent.click(screen.getByRole('button', { name: /HJK/ }));

    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('opens in a new tab rather than replacing the app', () => {
    render(<HomeDashboard summary={summary('https://maps.example/x')} t={t} />);

    const link = screen.getByRole('link', { name: /Directions to the venue/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});
