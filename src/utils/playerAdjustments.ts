import { PLAYER_ADJUSTMENTS_KEY } from '@/config/storageKeys';
import { getStorageItem, setStorageItem } from './storage';
import type { PlayerStatAdjustment } from '@/types';

export interface PlayerAdjustmentsIndex {
  [playerId: string]: PlayerStatAdjustment[];
}

export const getAllPlayerAdjustments = async (): Promise<PlayerAdjustmentsIndex> => {
  try {
    const json = await getStorageItem(PLAYER_ADJUSTMENTS_KEY);
    if (!json) return {};
    return JSON.parse(json) as PlayerAdjustmentsIndex;
  } catch {
    return {};
  }
};

export const getAdjustmentsForPlayer = async (playerId: string): Promise<PlayerStatAdjustment[]> => {
  const all = await getAllPlayerAdjustments();
  return all[playerId] || [];
};

export const addPlayerAdjustment = async (adj: Omit<PlayerStatAdjustment, 'id' | 'appliedAt'> & { id?: string; appliedAt?: string }): Promise<PlayerStatAdjustment> => {
  const all = await getAllPlayerAdjustments();
  const newAdj: PlayerStatAdjustment = {
    id: adj.id || `adj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    appliedAt: adj.appliedAt || new Date().toISOString(),
    playerId: adj.playerId,
    seasonId: adj.seasonId,
    teamId: adj.teamId,
    tournamentId: adj.tournamentId,
    externalTeamName: adj.externalTeamName,
    opponentName: adj.opponentName,
    scoreFor: adj.scoreFor,
    scoreAgainst: adj.scoreAgainst,
    gameDate: adj.gameDate,
    homeOrAway: adj.homeOrAway,
    gamesPlayedDelta: adj.gamesPlayedDelta || 0,
    goalsDelta: adj.goalsDelta || 0,
    assistsDelta: adj.assistsDelta || 0,
    note: adj.note,
    createdBy: adj.createdBy,
  };
  const list = all[newAdj.playerId] || [];
  all[newAdj.playerId] = [...list, newAdj];
  await setStorageItem(PLAYER_ADJUSTMENTS_KEY, JSON.stringify(all));
  return newAdj;
};

export const deletePlayerAdjustment = async (playerId: string, adjustmentId: string): Promise<boolean> => {
  const all = await getAllPlayerAdjustments();
  const list = all[playerId] || [];
  const next = list.filter(a => a.id !== adjustmentId);
  if (next.length === list.length) return false;
  all[playerId] = next;
  await setStorageItem(PLAYER_ADJUSTMENTS_KEY, JSON.stringify(all));
  return true;
};

export const updatePlayerAdjustment = async (playerId: string, adjustmentId: string, patch: Partial<PlayerStatAdjustment>): Promise<PlayerStatAdjustment | null> => {
  const all = await getAllPlayerAdjustments();
  const list = all[playerId] || [];
  const idx = list.findIndex(a => a.id === adjustmentId);
  if (idx === -1) return null;
  const updated: PlayerStatAdjustment = { ...list[idx], ...patch };
  list[idx] = updated;
  all[playerId] = list;
  await setStorageItem(PLAYER_ADJUSTMENTS_KEY, JSON.stringify(all));
  return updated;
};


