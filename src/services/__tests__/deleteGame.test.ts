/**
 * deleteGameWithCleanup: what goes with a deleted match.
 * @integration
 */

import { deleteGameWithCleanup } from '../deleteGame';
import { deleteGame } from '@/utils/savedGames';
import { deleteGameSubs } from '@/utils/playtimePlanner/gameSubs';
import { deletePlanLink } from '@/utils/playtimePlanner/planLinks';
import { deleteGameThemes } from '@/playbook/gameThemes';
import { deleteClipsForGame } from '@/utils/audioClipStore';
import { clearTimerAnchor } from '@/utils/timerAnchor';

jest.mock('@/utils/savedGames', () => ({ deleteGame: jest.fn() }));
jest.mock('@/utils/timerAnchor', () => ({ clearTimerAnchor: jest.fn() }));
jest.mock('@/utils/playtimePlanner/gameSubs', () => ({ deleteGameSubs: jest.fn().mockResolvedValue(true) }));
jest.mock('@/utils/playtimePlanner/planLinks', () => ({ deletePlanLink: jest.fn().mockResolvedValue(true) }));
jest.mock('@/playbook/gameThemes', () => ({ deleteGameThemes: jest.fn().mockResolvedValue(true) }));
jest.mock('@/utils/audioClipStore', () => ({ deleteClipsForGame: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn(), log: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deleteGameWithCleanup', () => {
  it('removes the game\'s planner data, Playbook themes and clips with it', async () => {
    (deleteGame as jest.Mock).mockResolvedValue('game_1');
    await expect(deleteGameWithCleanup('game_1', 'user_1')).resolves.toBe('game_1');
    expect(clearTimerAnchor).toHaveBeenCalledWith('game_1');
    expect(deleteGameSubs).toHaveBeenCalledWith('game_1');
    expect(deletePlanLink).toHaveBeenCalledWith('game_1');
    expect(deleteGameThemes).toHaveBeenCalledWith('game_1');
    expect(deleteClipsForGame).toHaveBeenCalledWith('game_1', 'user_1');
  });

  /** @edge-case */
  it('a failed theme clean-up does not fail the delete', async () => {
    (deleteGame as jest.Mock).mockResolvedValue('game_1');
    (deleteGameThemes as jest.Mock).mockRejectedValueOnce(new Error('storage'));
    await expect(deleteGameWithCleanup('game_1', undefined)).resolves.toBe('game_1');
  });

  it('cleans up nothing when the game was not found', async () => {
    (deleteGame as jest.Mock).mockResolvedValue(null);
    await expect(deleteGameWithCleanup('missing', undefined)).resolves.toBeNull();
    expect(deleteGameThemes).not.toHaveBeenCalled();
  });
});
