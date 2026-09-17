/**
 * @jest-environment jsdom
 * @critical - the two modals must hand VenueInput the pin the match already
 * has, or "open the map on the existing pin" silently degrades to "open on a
 * guess" with nothing else catching it.
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ToastProvider } from '@/contexts/ToastProvider';

/** Stands in for the real field and records what it was handed. */
const lastProps: { current: Record<string, unknown> | null } = { current: null };
let emitVenue: ((v: { name: string; latitude?: number; longitude?: number }) => void) | null = null;

jest.mock('@/components/VenueInput', () => ({
  __esModule: true,
  default: (props: { onChange: (v: { name: string; latitude?: number; longitude?: number }) => void }) => {
    lastProps.current = props as unknown as Record<string, unknown>;
    emitVenue = props.onChange;
    return <input data-testid="venue-field" readOnly />;
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, d?: unknown) => (typeof d === 'string' ? d : _k) }),
}));
jest.mock('@/utils/appSettings', () => ({
  getLastHomeTeamName: jest.fn(async () => 'Team'),
  saveLastHomeTeamName: jest.fn(async () => true),
}));
jest.mock('@/utils/playtimePlanner/storage', () => ({ getPlans: jest.fn(async () => ({})) }));
jest.mock('@/utils/teams', () => ({
  getTeamRoster: jest.fn(async () => []),
  getTeamDisplayName: jest.fn((team: { name: string }) => team.name),
  getTeamBoundSeries: jest.fn(async () => []),
}));

import NewGameSetupModal from '@/components/NewGameSetupModal';

beforeEach(() => {
  lastProps.current = null;
  emitVenue = null;
});

describe('NewGameSetupModal', () => {
  const renderModal = async () => {
    render(
      <ToastProvider>
        <NewGameSetupModal
          isOpen
          initialPlayerSelection={[]}
          onStart={jest.fn()}
          onCancel={jest.fn()}
          demandFactor={1}
          onDemandFactorChange={jest.fn()}
          masterRoster={[]}
          seasons={[]}
          tournaments={[]}
          teams={[]}
          personnel={[]}
        />
      </ToastProvider>,
    );
    await act(async () => { await Promise.resolve(); });
  };

  it('starts with no pin, so the map would have to guess', async () => {
    await renderModal();

    expect(screen.getByTestId('venue-field')).toBeInTheDocument();
    expect(lastProps.current?.latitude).toBeUndefined();
    expect(lastProps.current?.hasCoordinates).toBe(false);
  });

  /**
   * The round-trip that matters: coordinates picked in the field come back
   * down as props, so re-opening the map centres on the venue rather than
   * guessing at it again.
   */
  it('hands back the coordinates a pick produced', async () => {
    await renderModal();

    await act(async () => {
      emitVenue?.({ name: 'Kimpisen kenttä', latitude: 61.0583, longitude: 28.1887 });
    });

    expect(lastProps.current?.latitude).toBe(61.0583);
    expect(lastProps.current?.longitude).toBe(28.1887);
    expect(lastProps.current?.hasCoordinates).toBe(true);
  });

  /** A typed name with no pick must not leave stale coordinates behind. */
  it('drops the coordinates when the venue is only typed', async () => {
    await renderModal();

    await act(async () => {
      emitVenue?.({ name: 'Kimpisen kenttä', latitude: 61.0583, longitude: 28.1887 });
    });
    await act(async () => {
      emitVenue?.({ name: 'Somewhere else' });
    });

    expect(lastProps.current?.latitude).toBeUndefined();
    expect(lastProps.current?.hasCoordinates).toBe(false);
  });
});
