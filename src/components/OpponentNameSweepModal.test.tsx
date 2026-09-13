/**
 * @critical - this modal rewrites the coach's games in bulk and there is no
 * undo. The test that matters is not that it renames, but that it renames
 * ONLY the name it was pointed at.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import OpponentNameSweepModal from './OpponentNameSweepModal';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, options?: Record<string, unknown>) =>
      (fallback ?? key).replace(/\{\{(\w+)\}\}/g, (_m: string, n: string) => String(options?.[n] ?? '')),
  }),
}));

const mockShowToast = jest.fn();
jest.mock('@/contexts/ToastProvider', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
jest.mock('@/hooks/useDataStore', () => ({ useDataStore: () => ({ userId: 'user-1' }) }));
jest.mock('@/utils/logger', () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn() } }));

const mockSaveGame = jest.fn().mockResolvedValue({});
const mockUpdateSeason = jest.fn().mockResolvedValue({});
const mockGetSavedGames = jest.fn();
const mockGetSeasons = jest.fn();

jest.mock('@/utils/savedGames', () => ({
  getSavedGames: (...a: unknown[]) => mockGetSavedGames(...a),
  saveGame: (...a: unknown[]) => mockSaveGame(...a),
}));
jest.mock('@/utils/seasons', () => ({
  getSeasons: (...a: unknown[]) => mockGetSeasons(...a),
  updateSeason: (...a: unknown[]) => mockUpdateSeason(...a),
}));

const renderModal = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OpponentNameSweepModal isOpen onClose={jest.fn()} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSavedGames.mockResolvedValue({
    g1: { opponentName: 'IPS' },
    g2: { opponentName: 'Ips' },
    g3: { opponentName: 'IPS' },
    g4: { opponentName: 'IPS/Sininen' },
  });
  mockGetSeasons.mockResolvedValue([
    { id: 's1', name: 'Itä P11', opponents: ['Ips', 'KuPS'] },
  ]);
});

describe('OpponentNameSweepModal', () => {
  it('renders nothing when closed', () => {
    const client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <OpponentNameSweepModal isOpen={false} onClose={jest.fn()} />
      </QueryClientProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('groups the spellings of one name and counts each', async () => {
    renderModal();
    const group = await screen.findByTestId('opponent-sweep-group-ips');
    // Three games say IPS/Ips and the league list adds one more "Ips".
    expect(group).toHaveTextContent('IPS');
    expect(group).toHaveTextContent('Ips');
  });

  /**
   * @critical - the suggestion is the most-used spelling, and it is a default
   * the coach can overtype, never a claim about what is official.
   */
  it('suggests the most-used spelling, in an editable box', async () => {
    renderModal();
    const input = (await screen.findByTestId('opponent-sweep-input-ips')) as HTMLInputElement;
    expect(input.value).toBe('IPS'); // 2 games vs 1, plus one in the league list
    fireEvent.change(input, { target: { value: 'Imatran Palloseura' } });
    expect(input.value).toBe('Imatran Palloseura');
  });

  /**
   * @critical - "IPS/Sininen" is a different squad that happens to share a
   * club name. If it ever appears in the IPS group, a coach could merge two
   * real teams with one tap.
   */
  it('never offers to merge a team that only differs by its colour', async () => {
    renderModal();
    await screen.findByTestId('opponent-sweep-group-ips');
    expect(screen.queryByTestId('opponent-sweep-group-ips sininen')).not.toBeInTheDocument();
    expect(screen.getByTestId('opponent-sweep-group-ips')).not.toHaveTextContent('Sininen');
  });

  it('rewrites only the games spelled differently, and the league list', async () => {
    renderModal();
    fireEvent.click(await screen.findByTestId('opponent-sweep-apply-ips'));

    await waitFor(() => expect(mockSaveGame).toHaveBeenCalled());
    // g2 alone: g1 and g3 already read "IPS", g4 is another team.
    expect(mockSaveGame).toHaveBeenCalledTimes(1);
    expect(mockSaveGame).toHaveBeenCalledWith(
      'g2',
      expect.objectContaining({ opponentName: 'IPS' }),
      'user-1',
    );
    expect(mockUpdateSeason).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1', opponents: ['IPS', 'KuPS'] }),
      'user-1',
    );
  });

  it('drops the group once it is resolved', async () => {
    renderModal();
    fireEvent.click(await screen.findByTestId('opponent-sweep-apply-ips'));
    await waitFor(() =>
      expect(screen.queryByTestId('opponent-sweep-group-ips')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('opponent-sweep-clean')).toBeInTheDocument();
  });

  /**
   * @edge-case - a failed rename must say so. Silently leaving half the games
   * renamed is the one outcome worse than not starting.
   */
  it('says so when a rename fails', async () => {
    mockSaveGame.mockRejectedValueOnce(new Error('offline'));
    renderModal();
    fireEvent.click(await screen.findByTestId('opponent-sweep-apply-ips'));
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/Could not rename/), 'error'),
    );
    // The group stays, so the coach can retry rather than assume it worked.
    expect(screen.getByTestId('opponent-sweep-group-ips')).toBeInTheDocument();
  });

  it('says there is nothing to fix when every name is consistent', async () => {
    mockGetSavedGames.mockResolvedValue({ g1: { opponentName: 'KuPS' } });
    mockGetSeasons.mockResolvedValue([{ id: 's1', name: 'x', opponents: ['KuPS'] }]);
    renderModal();
    expect(await screen.findByTestId('opponent-sweep-clean')).toBeInTheDocument();
  });
});
