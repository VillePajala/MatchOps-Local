import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n.test';
import PlanningModal from '../PlanningModal';
import {
  PLAN_FORMAT_VERSION,
  PLAN_EXPORT_KIND,
} from '@/utils/planExport';

const validEnvelope = () => ({
  formatVersion: PLAN_FORMAT_VERSION,
  kind: PLAN_EXPORT_KIND,
  savedAt: '2026-04-28T12:00:00.000Z',
  tournament: {
    teamName: 'Pepo U10',
    formationId: '8v8-2-1-2-1-1',
    rosterSize: 11,
    games: [
      {
        id: 'g1',
        label: 'Game 1',
        time: '14:00',
        field: 'A',
        opponent: 'FC Opp',
        numberOfPeriods: 2,
        periodDurationMinutes: 12.5,
        durationMin: 25,
        halfTimeMin: 12.5,
        startingXI: { GK: 'p0', CDM: 'p1' },
        scheduledSubs: [
          { id: 'sub_1', timeSec: 600, role: 'CDM', outPlayer: 'p1', inPlayer: 'p2' },
        ],
      },
    ],
  },
  included: [true],
  currentVersionName: null,
});

const renderModal = (overrides: Partial<React.ComponentProps<typeof PlanningModal>> = {}) => {
  const props = { isOpen: true, onClose: jest.fn(), ...overrides };
  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <PlanningModal {...props} />
      </I18nextProvider>,
    ),
    props,
  };
};

const fileFromText = (name: string, text: string) =>
  new File([text], name, { type: 'application/json' });

describe('PlanningModal', () => {
  it('renders nothing when closed', () => {
    const { container } = renderModal({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the empty-state message when open with no import yet', () => {
    renderModal();
    expect(
      screen.getByText(
        /No saved planning sessions yet|Ei tallennettuja suunnitelmia/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Import plan from JSON|Tuo suunnitelma JSON-tiedostosta/i,
      }),
    ).toBeInTheDocument();
  });

  it('calls onClose when Done is clicked', () => {
    const { props } = renderModal();
    fireEvent.click(
      screen.getByRole('button', { name: /^Done$|^Valmis$/i }),
    );
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a success summary after a valid file is imported', async () => {
    renderModal();
    const file = fileFromText(
      'plan.json',
      JSON.stringify(validEnvelope()),
    );
    const input = screen.getByTestId(
      'planning-modal-file-input',
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText(/Plan imported|Suunnitelma tuotu/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Pepo U10/)).toBeInTheDocument();
    expect(screen.getByText(/8v8-2-1-2-1-1/)).toBeInTheDocument();
  });

  it('shows an error message and field path on invalid envelope', async () => {
    renderModal();
    const bad = JSON.stringify({ ...validEnvelope(), formatVersion: 2 });
    const file = fileFromText('bad.json', bad);
    const input = screen.getByTestId(
      'planning-modal-file-input',
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText(/Import failed|Tuonti epäonnistui/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Unsupported formatVersion/i)).toBeInTheDocument();
    // Error path renders inside a separate element matching the path string.
    expect(
      screen.getByText((_, el) => {
        if (!el || !el.textContent) return false;
        const t = el.textContent.trim();
        return /^(at|kohdassa):\s*formatVersion$/.test(t);
      }),
    ).toBeInTheDocument();
  });

  it('shows an error on malformed JSON', async () => {
    renderModal();
    const file = fileFromText('bad.json', '{ not valid json');
    const input = screen.getByTestId(
      'planning-modal-file-input',
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText(/Import failed|Tuonti epäonnistui/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/JSON parse error/i)).toBeInTheDocument();
  });

  it('rejects files larger than 1 MB without reading them', async () => {
    renderModal();
    // Build a "large" file via a 2 MB string buffer; the guard short-circuits
    // before FileReader runs, so we don't actually need real bytes parsed.
    const big = new File(['x'.repeat(2 * 1024 * 1024)], 'big.json', {
      type: 'application/json',
    });
    const input = screen.getByTestId(
      'planning-modal-file-input',
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { files: [big] } });

    await waitFor(() => {
      expect(
        screen.getByText(/File is too large|Tiedosto on liian suuri/i),
      ).toBeInTheDocument();
    });
  });

  it('shows readError when FileReader errors out', async () => {
    renderModal();
    // Replace FileReader with a mock that synchronously fires onerror.
    const realFileReader = window.FileReader;
    class MockFileReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      result: string | null = null;
      readAsText() {
        // Use a microtask so the React state updates happen during act.
        Promise.resolve().then(() => this.onerror?.());
      }
    }
    // @ts-expect-error - test injection
    window.FileReader = MockFileReader;

    try {
      const file = fileFromText('plan.json', '{}');
      const input = screen.getByTestId(
        'planning-modal-file-input',
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(
          screen.getByText(/Failed to read file|Tiedoston lukeminen/i),
        ).toBeInTheDocument();
      });
    } finally {
      window.FileReader = realFileReader;
    }
  });

  it('shows the New plan button on the list page', () => {
    renderModal();
    expect(
      screen.getByRole('button', { name: /New plan|Uusi suunnitelma/i }),
    ).toBeInTheDocument();
  });

  it('navigates to the picker when New plan is clicked, and back to the list on Back', () => {
    renderModal({ savedGames: {} });
    fireEvent.click(
      screen.getByRole('button', { name: /New plan|Uusi suunnitelma/i }),
    );
    expect(screen.getByTestId('planning-game-picker')).toBeInTheDocument();
    // Picker shows empty state when no games are available.
    expect(
      screen.getByText(/No games available|Aktiiviselle joukkueelle ei ole pelejä/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /back|takaisin/i })[0]);
    // Back on the list — New plan button visible again.
    expect(
      screen.getByRole('button', { name: /New plan|Uusi suunnitelma/i }),
    ).toBeInTheDocument();
  });

  it('passes the active team id to the picker so it filters to that team', () => {
    renderModal({
      currentTeamId: 'team_a',
      savedGames: {
        g1: {
          teamId: 'team_a',
          teamName: 'Pepo',
          opponentName: 'Opp',
          gameDate: '2026-04-28',
          numberOfPeriods: 2,
          periodDurationMinutes: 25,
        } as never,
        g2: {
          teamId: 'team_b',
          teamName: 'Other',
          opponentName: 'Opp',
          gameDate: '2026-04-28',
          numberOfPeriods: 2,
          periodDurationMinutes: 25,
        } as never,
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /New plan|Uusi suunnitelma/i }),
    );
    // Only g1 is eligible (team_a); g2 is filtered out.
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('clears import state when Done is clicked, so a re-open starts fresh', async () => {
    const { props, rerender } = renderModal();
    const file = fileFromText('plan.json', JSON.stringify(validEnvelope()));
    const input = screen.getByTestId(
      'planning-modal-file-input',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/Plan imported|Suunnitelma tuotu/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^Done$|^Valmis$/i }));
    expect(props.onClose).toHaveBeenCalled();

    // Re-render: empty state again
    rerender(
      <I18nextProvider i18n={i18n}>
        <PlanningModal isOpen onClose={props.onClose} />
      </I18nextProvider>,
    );
    expect(
      screen.getByText(
        /No saved planning sessions yet|Ei tallennettuja suunnitelmia/i,
      ),
    ).toBeInTheDocument();
  });
});
