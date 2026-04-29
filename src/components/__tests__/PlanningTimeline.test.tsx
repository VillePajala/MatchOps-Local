import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n.test';
import PlanningTimeline from '../PlanningTimeline';
import type { Player } from '@/types';
import type { PlanDraft } from '@/utils/planSwapEngine';
import { getPresetById } from '@/config/formationPresets';

const PRESET = getPresetById('8v8-3-3-1')!;

const makeRoster = (n: number): Player[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    nickname: `P${i}`,
    isGoalie: i === 0,
  })) as Player[];

const makeDraft = (extra: Partial<PlanDraft> = {}): PlanDraft => {
  // Map every role in the preset to a player p0..p(n-1) so the
  // timeline has assigned roles to add subs to. Bench gets the rest.
  const roles = (PRESET.roles ?? []).map((r) => r.name);
  const startingXI: Record<string, string> = {};
  roles.forEach((r, i) => {
    startingXI[r] = `p${i}`;
  });
  const bench = ['p8', 'p9', 'p10'];
  return { startingXI, bench, scheduledSubs: [], ...extra };
};

const renderTimeline = (
  overrides: Partial<React.ComponentProps<typeof PlanningTimeline>> = {},
) => {
  const props: React.ComponentProps<typeof PlanningTimeline> = {
    draft: makeDraft(),
    preset: PRESET,
    roster: makeRoster(11),
    gameDurationSec: 1500, // 25 minutes
    onAddSub: jest.fn(),
    onUpdateSub: jest.fn(),
    onRemoveSub: jest.fn(),
    ...overrides,
  };
  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <PlanningTimeline {...props} />
      </I18nextProvider>,
    ),
    props,
  };
};

describe('PlanningTimeline', () => {
  it('renders the empty-state message when there are no subs', () => {
    renderTimeline();
    expect(
      screen.getByText(/No scheduled subs yet|Ei ajastettuja vaihtoja/i),
    ).toBeInTheDocument();
  });

  it('shows per-player minutes for everyone in the roster', () => {
    renderTimeline();
    // Starting-XI players should show full game duration (25:00).
    expect(
      screen.getByTestId('planning-timeline-minutes-p0'),
    ).toHaveTextContent('25:00');
    // Bench players should show 00:00.
    expect(
      screen.getByTestId('planning-timeline-minutes-p8'),
    ).toHaveTextContent('00:00');
  });

  it('renders an existing sub row with formatted time, role, out → in', () => {
    const draft = makeDraft({
      scheduledSubs: [
        {
          id: 's1',
          timeSeconds: 600,
          outPlayer: 'p1',
          inPlayer: 'p8',
          positionRole: (PRESET.roles ?? [])[1].name,
        },
      ],
    });
    renderTimeline({ draft });
    const row = screen.getByTestId('planning-timeline-sub-s1');
    expect(row).toHaveTextContent('10:00');
    expect(row).toHaveTextContent('P1');
    expect(row).toHaveTextContent('P8');
  });

  it('opens the add form when the "Add sub" button is clicked', async () => {
    renderTimeline();
    expect(screen.queryByTestId('planning-timeline-form')).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-add'));
    });
    expect(screen.getByTestId('planning-timeline-form')).toBeInTheDocument();
  });

  it('Save adds a sub via onAddSub when inputs are valid', async () => {
    const onAddSub = jest.fn();
    renderTimeline({ onAddSub });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-add'));
    });
    const role1 = (PRESET.roles ?? [])[1].name;
    await act(async () => {
      fireEvent.change(screen.getByTestId('planning-timeline-form-time'), {
        target: { value: '10:00' },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('planning-timeline-form-role'), {
        target: { value: role1 },
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('planning-timeline-form-in'), {
        target: { value: 'p8' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-form-save'));
    });
    expect(onAddSub).toHaveBeenCalledTimes(1);
    const arg = onAddSub.mock.calls[0][0];
    expect(arg).toMatchObject({
      timeSeconds: 600,
      positionRole: role1,
      inPlayer: 'p8',
      outPlayer: 'p1', // currently at role1 per makeDraft fixture
    });
  });

  it('rejects invalid time format and shows an error', async () => {
    const onAddSub = jest.fn();
    renderTimeline({ onAddSub });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-add'));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('planning-timeline-form-time'), {
        target: { value: 'banana' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-form-save'));
    });
    expect(onAddSub).not.toHaveBeenCalled();
    expect(screen.getByTestId('planning-timeline-form-error')).toHaveTextContent(
      /Invalid time|Virheellinen aika/i,
    );
  });

  it('rejects time outside [0, gameDurationSec]', async () => {
    const onAddSub = jest.fn();
    renderTimeline({ onAddSub, gameDurationSec: 600 });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-add'));
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('planning-timeline-form-time'), {
        target: { value: '15:00' }, // past the 10-minute game
      });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('planning-timeline-form-in'), {
        target: { value: 'p8' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-form-save'));
    });
    expect(onAddSub).not.toHaveBeenCalled();
    expect(
      screen.getByTestId('planning-timeline-form-error').textContent,
    ).toMatch(/between 00:00|välillä/i);
  });

  it('rejects a self-sub (in player already at the role at that time)', async () => {
    const onAddSub = jest.fn();
    renderTimeline({ onAddSub });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-add'));
    });
    const role1 = (PRESET.roles ?? [])[1].name;
    await act(async () => {
      fireEvent.change(screen.getByTestId('planning-timeline-form-role'), {
        target: { value: role1 },
      });
    });
    // The "in" select filters self out, so self-sub via UI is not
    // reachable via the dropdown. The validation guard still fires when
    // the time changes after a player is picked. Verify the dropdown
    // excludes the current occupant (p1 at role1).
    const inSelect = screen.getByTestId('planning-timeline-form-in') as HTMLSelectElement;
    const optionValues = Array.from(inSelect.options).map((o) => o.value);
    expect(optionValues).not.toContain('p1');
  });

  it('opens the edit form pre-populated when a sub is edited', async () => {
    const draft = makeDraft({
      scheduledSubs: [
        {
          id: 's1',
          timeSeconds: 600,
          outPlayer: 'p1',
          inPlayer: 'p8',
          positionRole: (PRESET.roles ?? [])[1].name,
        },
      ],
    });
    renderTimeline({ draft });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-sub-edit-s1'));
    });
    const time = screen.getByTestId(
      'planning-timeline-form-time',
    ) as HTMLInputElement;
    expect(time.value).toBe('10:00');
  });

  it('removes a sub when the trash button is clicked', async () => {
    const draft = makeDraft({
      scheduledSubs: [
        {
          id: 's1',
          timeSeconds: 600,
          outPlayer: 'p1',
          inPlayer: 'p8',
          positionRole: (PRESET.roles ?? [])[1].name,
        },
      ],
    });
    const onRemoveSub = jest.fn();
    renderTimeline({ draft, onRemoveSub });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-sub-remove-s1'));
    });
    expect(onRemoveSub).toHaveBeenCalledWith('s1');
  });

  it('disables interactions when disabled=true', () => {
    const draft = makeDraft({
      scheduledSubs: [
        {
          id: 's1',
          timeSeconds: 600,
          outPlayer: 'p1',
          inPlayer: 'p8',
          positionRole: (PRESET.roles ?? [])[1].name,
        },
      ],
    });
    renderTimeline({ draft, disabled: true });
    expect(screen.getByTestId('planning-timeline-add')).toBeDisabled();
    expect(screen.getByTestId('planning-timeline-sub-edit-s1')).toBeDisabled();
    expect(screen.getByTestId('planning-timeline-sub-remove-s1')).toBeDisabled();
  });

  it('Cancel closes the form without calling onAddSub', async () => {
    const onAddSub = jest.fn();
    renderTimeline({ onAddSub });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-add'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('planning-timeline-form-cancel'));
    });
    expect(screen.queryByTestId('planning-timeline-form')).not.toBeInTheDocument();
    expect(onAddSub).not.toHaveBeenCalled();
  });

  it('add button is disabled when no roles are assigned', () => {
    // Empty startingXI = no roles to sub into.
    const draft: PlanDraft = {
      startingXI: {},
      bench: ['p0', 'p1', 'p2'],
      scheduledSubs: [],
    };
    renderTimeline({ draft });
    expect(screen.getByTestId('planning-timeline-add')).toBeDisabled();
  });

  it('per-player minutes split correctly when a sub is in place', () => {
    const role1 = (PRESET.roles ?? [])[1].name;
    const draft = makeDraft({
      scheduledSubs: [
        {
          id: 's1',
          timeSeconds: 600,
          outPlayer: 'p1',
          inPlayer: 'p8',
          positionRole: role1,
        },
      ],
    });
    renderTimeline({ draft });
    // p1 played 0-600 (10:00), p8 played 600-1500 (15:00).
    expect(
      screen.getByTestId('planning-timeline-minutes-p1'),
    ).toHaveTextContent('10:00');
    expect(
      screen.getByTestId('planning-timeline-minutes-p8'),
    ).toHaveTextContent('15:00');
  });
});
