/**
 * Review 9.1: export a fully populated store, restore it into an empty one, and
 * compare - the real LocalDataStore on fake IndexedDB, no hand-built backup JSON.
 * Hand-built restore tests could not catch what the store itself changes on the way
 * back in (e.g. 10.8: club-season labels recomputed from the wrong dates).
 * @critical @integration
 */
import { freshLocalStore } from '../../../tests/utils/realLocalDataStore';
import { generateFullBackupJson, importFullBackup } from '../fullBackup';
import { getDataStore, resetFactory } from '@/datastore/factory';
import type { DataStore } from '@/interfaces/DataStore';
import { TestFixtures } from '../../../tests/fixtures';

jest.mock('@/utils/logger', () => {
  const fns = { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { __esModule: true, default: fns, createLogger: jest.fn(() => fns) };
});

/**
 * Restore re-stamps records (createdAt/updatedAt: the restored rows are written now)
 * and selects a game to open (settings.currentGameId) - bookkeeping, not the coach's
 * data. Only those record-level fields are left out; nested data (e.g. assessment
 * timestamps inside a game) is compared in full.
 */
const unstamp = <T,>(record: T): T => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
  const copy = { ...(record as Record<string, unknown>) };
  delete copy.createdAt;
  delete copy.updatedAt;
  return copy as T;
};

/** Everything the coach would notice after a restore, in a comparable form. */
async function snapshot(ds: DataStore) {
  const byId = <T extends { id: string }>(list: T[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));
  const adjustments = await ds.getAllPlayerAdjustments();
  const settings = unstamp(await ds.getSettings()) as unknown as Record<string, unknown>;
  delete settings.currentGameId;
  return {
    players: byId(await ds.getPlayers()).map(unstamp),
    teams: byId(await ds.getTeams(true)).map(unstamp),
    rosters: Object.fromEntries(Object.entries(await ds.getAllTeamRosters()).map(([k, v]) => [k, v.map(unstamp)])),
    seasons: byId(await ds.getSeasons(true)).map(unstamp),
    tournaments: byId(await ds.getTournaments(true)).map(unstamp),
    personnel: byId(await ds.getAllPersonnel()).map(unstamp),
    games: await ds.getGames(),
    settings,
    adjustments: Object.fromEntries([...adjustments.entries()].map(([k, v]) => [k, byId(v)])),
  };
}

describe('full backup round trip', () => {
  beforeEach(async () => {
    await freshLocalStore();
  });

  it('restores a populated store to exactly what was exported', async () => {
    const ds = await getDataStore();

    // A 1 July season start (default 15 Nov): 15 Jul 2025 is '25/26' here, '24/25' under
    // the default dates - the label 10.8 got wrong on restore.
    await ds.saveSettings({ ...(await ds.getSettings()), clubSeasonStartDate: '2000-07-01', clubSeasonEndDate: '2000-06-30' });
    const alice = await ds.createPlayer({ name: 'Alice', jerseyNumber: '7', isGoalie: false });
    const bob = await ds.createPlayer({ name: 'Bob', nickname: 'B', jerseyNumber: '1', isGoalie: true });
    const season = await ds.createSeason('Kevät', { startDate: '2025-07-15', gameType: 'soccer' });
    await ds.createTournament('Cup', { startDate: '2025-07-20' });
    const team = await ds.createTeam({ name: 'PK-35 P12', color: '#ff0000', boundSeasonId: season.id });
    await ds.setTeamRoster(team.id, [{ id: alice.id, name: 'Alice', jerseyNumber: '7' }, { id: bob.id, name: 'Bob', isGoalie: true }]);
    await ds.addPersonnelMember({ name: 'Coach Carla', role: 'head_coach', phone: '', email: '', certifications: ['UEFA C'], notes: '' });
    const game = TestFixtures.games.completed({
      seasonId: season.id,
      teamId: team.id,
      assessments: {
        [alice.id]: { overall: 7, sliders: { passing: 6 }, sliderScaleVersion: 3, notes: 'Good', minutesPlayed: 40, createdAt: 1_700_000_000_000, createdBy: 'coach' },
      },
    });
    await ds.saveGame('game_rt', { ...game });
    await ds.addPlayerAdjustment({
      playerId: alice.id, seasonId: season.id, gamesPlayedDelta: 1, goalsDelta: 2, assistsDelta: 0, gameDate: '2025-08-01',
    });

    const before = await snapshot(ds);
    expect(before.seasons[0].clubSeason).toBe('25/26');

    const json = await generateFullBackupJson();
    await ds.clearAllUserData();
    expect((await snapshot(ds)).players).toEqual([]);
    // Restore as on a fresh device / app start: nothing cached from before.
    await resetFactory();

    const result = await importFullBackup(json, undefined, undefined, true, true);
    expect(result?.success).toBe(true);

    expect(await snapshot(await getDataStore())).toEqual(before);
  });
});
