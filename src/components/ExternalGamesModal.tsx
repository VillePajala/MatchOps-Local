'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player, Season, Tournament, Team } from '@/types';
import { CollapsibleModalHeader, ModalContainer, selectStyle, labelStyle, subtextStyle } from '@/styles/modalStyles';
import ExternalGamesSection from './ExternalGamesSection';

/**
 * Ulkoiset pelit as a place of its own: the same section PlayerStatsView
 * shows, reached from a player's menu in Seura (player picked already) or
 * from "Lisää ulkoinen peli" on Home (pick the player first). Phase 3 of the
 * external-games plan; the stats drill-down entry stays as it was.
 */
interface ExternalGamesModalProps {
  isOpen: boolean;
  onClose: () => void;
  players: Player[];
  seasons: Season[];
  tournaments: Tournament[];
  teams: Team[];
  /** Preselected player (from the roster menu); null means the coach picks one. */
  initialPlayerId?: string | null;
  /** The roster query is still loading: show nothing rather than the empty-roster hint for a flash. */
  playersLoading?: boolean;
}

const ExternalGamesModal: React.FC<ExternalGamesModalProps> = ({ isOpen, onClose, players, seasons, tournaments, teams, initialPlayerId = null, playersLoading = false }) => {
  const { t, i18n } = useTranslation();
  // Seeded once: ClubModalsHost mounts this modal only while open, so a new
  // initialPlayerId always arrives with a fresh mount. Keep it that way. An id
  // the roster no longer has falls back to "pick one".
  const [playerId, setPlayerId] = useState<string>(() => (initialPlayerId && players.some(p => p.id === initialPlayerId) ? initialPlayerId : ''));
  const sorted = useMemo(() => [...players].sort((a, b) => a.name.localeCompare(b.name, i18n.language)), [players, i18n.language]);
  const player = useMemo(() => sorted.find(p => p.id === playerId) ?? null, [sorted, playerId]);

  if (!isOpen) return null;
  return (
    <ModalContainer aria-label={t('externalGamesModal.title', 'Add to player stats')}>
      <CollapsibleModalHeader
        title={t('externalGamesModal.title', 'Add to player stats')}
        onClose={onClose}
        closeLabel={t('common.doneButton', 'Done')}
      />
      <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6">
        <p className={`${subtextStyle} mb-4`}>{t('externalGamesModal.intro', "Games not recorded in the app as matches. They count only in this player's stats.")}</p>
        {playersLoading ? null : sorted.length === 0 ? (
          <p className="text-sm text-slate-400">{t('externalGamesModal.noPlayers', 'Add your players on the Club tab first.')}</p>
        ) : (
          <div className="mb-4">
            <label className={labelStyle} htmlFor="external-games-player">{t('externalGamesModal.pickPlayer', 'Pick a player')}</label>
            <select
              id="external-games-player"
              data-testid="external-games-player"
              className={selectStyle}
              value={playerId}
              onChange={e => setPlayerId(e.target.value)}
            >
              <option value="">{t('externalGamesModal.choosePlaceholder', 'Select a player')}</option>
              {sorted.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.nickname ? ` (${p.nickname})` : ''}</option>
              ))}
            </select>
          </div>
        )}
        {player && (
          // Keyed by player so a switch starts the section (and its open add form) fresh.
          <ExternalGamesSection
            key={player.id}
            player={player}
            seasons={seasons}
            tournaments={tournaments}
            teams={teams}
            defaultOpen
            startWithAdd={!initialPlayerId}
          />
        )}
      </div>
    </ModalContainer>
  );
};

export default ExternalGamesModal;
