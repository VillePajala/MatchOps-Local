import { getMasterRoster, addPlayer, updatePlayer, removePlayer, setGoalieStatus } from './masterRosterManager';
import {
  getMasterRoster as utilGetMasterRoster,
  addPlayerToRoster,
  updatePlayerInRoster,
  removePlayerFromRoster,
  setPlayerGoalieStatus,
} from './masterRoster';
import type { Player } from '@/types';
import { QueryClient } from '@tanstack/react-query';

jest.mock('./masterRoster');
jest.mock('./teams', () => ({
  getAllTeamRosters: jest.fn(),
  removePlayerFromRoster: jest.fn(),
}));
const mockTeams = jest.fn();
// A plain function, not jest.fn: the suite's resetAllMocks would wipe its implementation.
jest.mock('@/datastore/factory', () => ({
  getDataStore: async () => ({ getTeams: (includeArchived?: boolean) => mockTeams(includeArchived) }),
}));
import { getAllTeamRosters, removePlayerFromRoster as removeFromTeamRoster } from './teams';
const mockedGetAllTeamRosters = getAllTeamRosters as jest.MockedFunction<typeof getAllTeamRosters>;
const mockedRemoveFromTeam = removeFromTeamRoster as jest.MockedFunction<typeof removeFromTeamRoster>;

const mockRoster: Player[] = [
  { id: '1', name: 'A', isGoalie: false, receivedFairPlayCard: false },
];

jest.mock('./logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }))
}));

const mockedUtilGet = utilGetMasterRoster as jest.MockedFunction<typeof utilGetMasterRoster>;
const mockedAdd = addPlayerToRoster as jest.MockedFunction<typeof addPlayerToRoster>;
const mockedUpdate = updatePlayerInRoster as jest.MockedFunction<typeof updatePlayerInRoster>;
const mockedRemove = removePlayerFromRoster as jest.MockedFunction<typeof removePlayerFromRoster>;
const mockedSetGoalie = setPlayerGoalieStatus as jest.MockedFunction<typeof setPlayerGoalieStatus>;

beforeEach(() => {
  jest.resetAllMocks();
});

it('returns roster on success', async () => {
  mockedUtilGet.mockResolvedValue(mockRoster);
  await expect(getMasterRoster()).resolves.toEqual(mockRoster);
});

/** Review 1.4: a failed read propagates so React Query can retry. @critical */
it('rethrows on get error instead of returning an empty roster', async () => {
  mockedUtilGet.mockRejectedValue(new Error('fail'));
  await expect(getMasterRoster()).rejects.toThrow('fail');
});

/**
 * Review 1.4: with the roster used as a query function, a failed refetch keeps
 * the last good roster in the cache instead of replacing it with [] (which the
 * live-game prune read as "every player deleted").
 * @critical
 */
it('a failed refetch keeps the last good roster in the query cache', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const queryKey = ['masterRoster', 'user-1'];
  mockedUtilGet.mockResolvedValueOnce(mockRoster);
  await client.fetchQuery({ queryKey, queryFn: () => getMasterRoster('user-1') });

  mockedUtilGet.mockRejectedValueOnce(new Error('IndexedDB read failed'));
  await expect(
    client.fetchQuery({ queryKey, queryFn: () => getMasterRoster('user-1'), staleTime: 0 }),
  ).rejects.toThrow('IndexedDB read failed');

  expect(client.getQueryData(queryKey)).toEqual(mockRoster);
  expect(client.getQueryState(queryKey)?.status).toBe('error');
  client.clear();
});

it('adds player via util', async () => {
  const player = mockRoster[0];
  mockedAdd.mockResolvedValue(player);
  await expect(addPlayer(player)).resolves.toBe(player);
});

it('returns null when add fails', async () => {
  mockedAdd.mockRejectedValue(new Error('err'));
  await expect(addPlayer(mockRoster[0])).resolves.toBeNull();
});

it('updates player via util', async () => {
  const player = mockRoster[0];
  mockedUpdate.mockResolvedValue(player);
  await expect(updatePlayer('1', { name: 'B' })).resolves.toBe(player);
});

it('returns null when update fails', async () => {
  mockedUpdate.mockRejectedValue(new Error('err'));
  await expect(updatePlayer('1', { name: 'B' })).resolves.toBeNull();
});

it('removes player via util', async () => {
  mockedRemove.mockResolvedValue(true);
  mockedGetAllTeamRosters.mockResolvedValue({});
  mockTeams.mockResolvedValue([]);
  await expect(removePlayer('1')).resolves.toBe(true);
});

/**
 * Review 7.16: a deleted player's copy in the team rosters used to stay - counted
 * in the Teams list and stored (in the cloud too) until the team was re-saved.
 * @critical
 */
it('a deleted player leaves every team roster that has them, and only those', async () => {
  mockedRemove.mockResolvedValue(true);
  const p = (id: string) => ({ id, name: id, nickname: '', jerseyNumber: '', isGoalie: false, receivedFairPlayCard: false });
  // t3 is archived (still a team); 'gone' is a deleted team whose roster is kept.
  mockedGetAllTeamRosters.mockResolvedValue({ t1: [p('1'), p('2')], t2: [p('2')], t3: [p('1')], gone: [p('1')] });
  mockTeams.mockResolvedValue([{ id: 't1' }, { id: 't2' }, { id: 't3', archived: true }]);
  mockedRemoveFromTeam.mockResolvedValue(true);
  await expect(removePlayer('1', 'u1')).resolves.toBe(true);
  expect(mockTeams).toHaveBeenCalledWith(true); // archived teams included
  expect(mockedRemoveFromTeam.mock.calls).toEqual([['t1', '1', 'u1'], ['t3', '1', 'u1']]);
});

it('a team whose clean-up fails does not stop the others', async () => {
  mockedRemove.mockResolvedValue(true);
  const p = (id: string) => ({ id, name: id, nickname: '', jerseyNumber: '', isGoalie: false, receivedFairPlayCard: false });
  mockedGetAllTeamRosters.mockResolvedValue({ t1: [p('1')], t2: [p('1')] });
  mockTeams.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
  mockedRemoveFromTeam.mockRejectedValueOnce(new Error('locked')).mockResolvedValue(true);
  await expect(removePlayer('1', 'u1')).resolves.toBe(true);
  expect(mockedRemoveFromTeam).toHaveBeenCalledWith('t2', '1', 'u1');
});

it('a failed roster clean-up does not turn the delete into a failure', async () => {
  mockedRemove.mockResolvedValue(true);
  mockedGetAllTeamRosters.mockRejectedValue(new Error('offline'));
  await expect(removePlayer('1')).resolves.toBe(true);
});

it('nothing is touched when the delete itself fails', async () => {
  mockedRemove.mockResolvedValue(false);
  await expect(removePlayer('1')).resolves.toBe(false);
  expect(mockedGetAllTeamRosters).not.toHaveBeenCalled();
});

it('returns false when remove fails', async () => {
  mockedRemove.mockRejectedValue(new Error('err'));
  await expect(removePlayer('1')).resolves.toBe(false);
});

it('sets goalie via util', async () => {
  const player = mockRoster[0];
  mockedSetGoalie.mockResolvedValue(player);
  await expect(setGoalieStatus('1', true)).resolves.toBe(player);
});

it('returns null when set goalie fails', async () => {
  mockedSetGoalie.mockRejectedValue(new Error('err'));
  await expect(setGoalieStatus('1', true)).resolves.toBeNull();
});

