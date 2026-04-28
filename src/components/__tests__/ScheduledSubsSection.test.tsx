import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n.test';
import ScheduledSubsSection from '../ScheduledSubsSection';
import type { ScheduledSub } from '@/types/game';
import type { Player } from '@/types';

const players: Player[] = [
  { id: 'p1', name: 'Roope', isGoalie: false, jerseyNumber: '7' },
  { id: 'p2', name: 'Tomas', isGoalie: false, jerseyNumber: '11' },
  { id: 'p3', name: 'Ville', isGoalie: false, jerseyNumber: '4' },
];

const baseSub: ScheduledSub = {
  id: 'sub_1',
  timeSeconds: 600, // 10:00
  outPlayer: 'p1',
  inPlayer: 'p2',
  positionRole: 'CDM',
  status: 'pending',
};

const renderSection = (overrides: Partial<React.ComponentProps<typeof ScheduledSubsSection>> = {}) => {
  const props = {
    subs: [],
    availablePlayers: players,
    onAdd: jest.fn(),
    onUpdate: jest.fn(),
    onDelete: jest.fn(),
    ...overrides,
  };
  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <ScheduledSubsSection {...props} />
      </I18nextProvider>,
    ),
    props,
  };
};

describe('ScheduledSubsSection', () => {
  it('shows the empty-state message when there are no subs', () => {
    renderSection();
    expect(
      screen.getByText(/No scheduled substitutions yet|Ei suunniteltuja vaihtoja/i),
    ).toBeInTheDocument();
  });

  it('lists each sub with resolved player names and the time', () => {
    renderSection({ subs: [baseSub] });
    const row = screen.getByTestId('scheduled-sub-row-sub_1');
    expect(row).toHaveTextContent('10:00');
    expect(row).toHaveTextContent('Roope');
    expect(row).toHaveTextContent('Tomas');
    expect(row).toHaveTextContent('CDM');
  });

  it('opens the form on Add and saves a new sub via onAdd', () => {
    const { props } = renderSection();
    fireEvent.click(screen.getByRole('button', { name: /add scheduled sub|lisää suunniteltu vaihto/i }));

    fireEvent.change(screen.getByLabelText(/^Out|^Ulos/i), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText(/^In|^Sisään/i), { target: { value: 'p2' } });
    fireEvent.change(screen.getByLabelText(/Role.*position|Rooli.*paikka/i), {
      target: { value: 'CDM' },
    });
    fireEvent.change(screen.getByLabelText(/Time.*minutes|Aika.*minuutit/i), {
      target: { value: '12' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^Save|^Tallenna/i }));

    expect(props.onAdd).toHaveBeenCalledWith({
      timeSeconds: 720, // 12 minutes
      outPlayer: 'p1',
      inPlayer: 'p2',
      positionRole: 'CDM',
    });
  });

  it('disables Save while the draft is invalid (missing fields)', () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /add scheduled sub|lisää suunniteltu vaihto/i }));
    expect(screen.getByRole('button', { name: /^Save|^Tallenna/i })).toBeDisabled();
  });

  it('disables Save when out and in players are the same', () => {
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: /add scheduled sub|lisää suunniteltu vaihto/i }));
    fireEvent.change(screen.getByLabelText(/^Out|^Ulos/i), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText(/^In|^Sisään/i), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText(/Role.*position|Rooli.*paikka/i), {
      target: { value: 'CDM' },
    });
    fireEvent.change(screen.getByLabelText(/Time.*minutes|Aika.*minuutit/i), {
      target: { value: '5' },
    });
    expect(screen.getByRole('button', { name: /^Save|^Tallenna/i })).toBeDisabled();
  });

  it('opens the form pre-filled when editing an existing sub and calls onUpdate', () => {
    const { props } = renderSection({ subs: [baseSub] });
    fireEvent.click(screen.getByLabelText(/Edit 10:00|Muokkaa 10:00/i));

    fireEvent.change(screen.getByLabelText(/Time.*minutes|Aika.*minuutit/i), {
      target: { value: '15' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save|^Tallenna/i }));

    expect(props.onUpdate).toHaveBeenCalledWith({
      ...baseSub,
      timeSeconds: 900,
    });
  });

  it('calls onDelete when Delete is clicked', () => {
    const { props } = renderSection({ subs: [baseSub] });
    fireEvent.click(screen.getByLabelText(/Delete 10:00|Poista 10:00/i));
    expect(props.onDelete).toHaveBeenCalledWith('sub_1');
  });

  it('disables Edit on a fired/skipped sub (only pending subs are editable)', () => {
    renderSection({ subs: [{ ...baseSub, status: 'fired' }] });
    expect(screen.getByLabelText(/Edit 10:00|Muokkaa 10:00/i)).toBeDisabled();
  });

  it('disables Delete on a fired sub (preserves audit trail of applied subs)', () => {
    renderSection({ subs: [{ ...baseSub, status: 'fired' }] });
    expect(screen.getByLabelText(/Delete 10:00|Poista 10:00/i)).toBeDisabled();
  });

  it('disables Delete on a skipped sub', () => {
    renderSection({ subs: [{ ...baseSub, status: 'skipped' }] });
    expect(screen.getByLabelText(/Delete 10:00|Poista 10:00/i)).toBeDisabled();
  });
});
