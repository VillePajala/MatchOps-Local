import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatTime } from '@/utils/time';
import { isSidelinePosition } from '@/utils/positionLabels';
import { getSeasonDisplayName, getTournamentDisplayName } from '@/utils/entityDisplayNames';
import { getLeagueName } from '@/config/leagues';
import type { Player, Season, Tournament } from '@/types';
import type { GameEvent } from '@/types/game';
import type { GameSessionState } from '@/hooks/useGameSessionReducer';

export interface DesktopFieldPanelProps {
  availablePlayers: Player[];
  playersOnField: Player[];
  gameSessionState: GameSessionState;
  seasons: Season[];
  tournaments: Tournament[];
}

/**
 * Desktop-only match info panel rendered inside the shared side-panel aside.
 * Styled to match GameStatsModal's "Current Game" tab (gradient boxes, cards).
 * Does NOT render its own aside wrapper — parent FieldContainer provides that.
 */
export function DesktopFieldPanel({
  availablePlayers,
  playersOnField,
  gameSessionState,
  seasons,
  tournaments,
}: DesktopFieldPanelProps) {
  const { t } = useTranslation();

  const {
    teamName,
    opponentName,
    homeScore,
    awayScore,
    homeOrAway,
    currentPeriod,
    numberOfPeriods,
    gameStatus,
    timeElapsedInSeconds,
    gameEvents,
    selectedPlayerIds,
    gameDate,
    gameTime,
    gameLocation,
    ageGroup,
    seasonId,
    tournamentId,
    leagueId,
    customLeagueName,
    periodDurationMinutes,
    gameNotes,
  } = gameSessionState;

  // Match squad = only players selected for this game
  const selectedSet = new Set(selectedPlayerIds);
  const matchPlayers = availablePlayers.filter(p => selectedSet.has(p.id));

  // Split into on-field (formation) and subs (sideline circles)
  const onFieldIds = new Set(playersOnField.map(p => p.id));
  const isOnFieldFormation = (p: Player): boolean => {
    if (!onFieldIds.has(p.id)) return false;
    const fieldPlayer = playersOnField.find(fp => fp.id === p.id);
    if (!fieldPlayer || fieldPlayer.relX == null) return false;
    // Players at sideline positions (grayed circles) are subs, not on-field
    return !isSidelinePosition(fieldPlayer.relX);
  };
  const onFieldFormation = matchPlayers.filter(isOnFieldFormation);
  const subs = matchPlayers.filter(p => !isOnFieldFormation(p));

  // Events sorted most-recent first
  const sortedEvents = [...gameEvents].reverse();

  // Quick stats from events (goals omitted — score already shown above)
  const subCount = gameEvents.filter(e => e.type === 'substitution').length;
  const fairPlayCount = gameEvents.filter(e => e.type === 'fairPlayCard').length;
  const hasStats = subCount > 0 || fairPlayCount > 0;

  // Score display respects home/away
  const leftTeam = homeOrAway === 'home' ? teamName : opponentName;
  const rightTeam = homeOrAway === 'home' ? opponentName : teamName;
  const leftScore = homeOrAway === 'home' ? homeScore : awayScore;
  const rightScore = homeOrAway === 'home' ? awayScore : homeScore;

  // Status label
  const statusLabel = (() => {
    switch (gameStatus) {
      case 'notStarted':
        return t('desktopPanel.notStarted', 'Not Started');
      case 'inProgress':
        return `${t('common.period', 'Period')} ${currentPeriod} / ${numberOfPeriods}`;
      case 'periodEnd':
        return t('desktopPanel.periodBreak', 'Period Break');
      case 'gameEnd':
        return t('desktopPanel.gameEnded', 'Game Ended');
      default:
        return '';
    }
  })();

  // Resolve season/tournament names
  const season = seasonId ? seasons.find(s => s.id === seasonId) : null;
  const tournament = tournamentId ? tournaments.find(t => t.id === tournamentId) : null;
  const seasonName = season ? getSeasonDisplayName(season) : '';
  const tournamentName = tournament ? getTournamentDisplayName(tournament) : '';
  const leagueName = leagueId === 'muu' ? (customLeagueName || '') : getLeagueName(leagueId);

  // Format date for display
  const formattedDate = gameDate ? (() => {
    const parts = gameDate.split('-');
    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return gameDate;
  })() : '';

  // Strip "(valinnainen)" / "(optional)" suffix from labels — not needed in read-only view
  const stripOptional = (label: string) =>
    label.replace(/\s*\(valinnainen\)$/i, '').replace(/\s*\(optional\)$/i, '');

  // Build detail items (only show non-empty values)
  const detailItems: { label: string; value: string }[] = [];
  if (formattedDate) {
    const dateValue = gameTime ? `${formattedDate} ${gameTime}` : formattedDate;
    detailItems.push({ label: t('desktopPanel.dateLabel', 'Date'), value: dateValue });
  }
  if (gameLocation) {
    detailItems.push({ label: stripOptional(t('gameSettingsModal.locationLabel', 'Location')), value: gameLocation });
  }
  if (seasonName) {
    detailItems.push({ label: stripOptional(t('gameSettingsModal.kausi', 'Season')), value: seasonName });
  }
  if (tournamentName) {
    detailItems.push({ label: stripOptional(t('gameSettingsModal.turnaus', 'Tournament')), value: tournamentName });
  }
  if (leagueName) {
    detailItems.push({ label: stripOptional(t('gameSettingsModal.leagueLabel', 'League')), value: leagueName });
  }
  if (ageGroup) {
    detailItems.push({ label: stripOptional(t('gameSettingsModal.ageGroupLabel', 'Age Group')), value: ageGroup });
  }
  detailItems.push({
    label: t('desktopPanel.durationLabel', 'Duration'),
    value: `${numberOfPeriods} \u00D7 ${periodDurationMinutes} min`,
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto min-h-0">
      <div className="px-3 py-3 space-y-3">

        {/* Score & Status */}
        <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-700 shadow-inner">
          <div className="text-sm text-center text-slate-400 uppercase tracking-wider mb-2">{statusLabel}</div>
          <div className="text-center font-semibold text-slate-200">
            {leftTeam || t('common.team', 'Team')}
          </div>
          <div className="text-center text-2xl text-yellow-400 font-bold tabular-nums my-1">
            {leftScore} - {rightScore}
          </div>
          <div className="text-center font-semibold text-slate-200">
            {rightTeam || t('common.opponent', 'Opponent')}
          </div>
          <div className="text-center text-lg font-mono text-slate-300 mt-2 tabular-nums">
            {formatTime(timeElapsedInSeconds)}
          </div>
        </div>

        {/* Quick Stats */}
        {hasStats && (
          <div className="flex items-center gap-4 px-1 text-sm text-slate-300">
            {subCount > 0 && (
              <span title={t('desktopPanel.substitution', 'Substitution')}>
                {'\uD83D\uDD04'} {subCount} {t('desktopPanel.substitution', 'Substitution')}
              </span>
            )}
            {fairPlayCount > 0 && (
              <span title={t('desktopPanel.fairPlayCard', 'Fair Play Card')}>
                {'\uD83D\uDFE2'} {fairPlayCount}
              </span>
            )}
          </div>
        )}

        {/* Game Details */}
        {detailItems.length > 0 && (
          <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-700 shadow-inner space-y-1.5">
            {detailItems.map(item => (
              <div key={item.label} className="flex justify-between gap-3">
                <span className="text-base text-slate-300 flex-shrink-0">{item.label}</span>
                <span className="text-base text-slate-100 text-right">{item.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Game Notes */}
        {gameNotes && (
          <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-700 shadow-inner">
            <h3 className="text-sm font-semibold text-yellow-400/80 uppercase tracking-wider mb-1.5">
              {t('gameSettingsModal.notesTitle', 'Game Notes')}
            </h3>
            <p className="text-base text-slate-200 whitespace-pre-line line-clamp-4">{gameNotes}</p>
          </div>
        )}

        {/* Match Squad */}
        <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-700 shadow-inner">
          <div className="flex gap-4">
            {/* On Field */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-yellow-400/80 uppercase tracking-wider mb-2">
                {t('desktopPanel.onField', 'On Field')} ({onFieldFormation.length})
              </h3>
              {onFieldFormation.length === 0 ? (
                <p className="text-sm text-slate-500 italic">
                  {t('desktopPanel.noPlayersOnField', 'No players on field')}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {onFieldFormation.map(player => (
                    <PlayerRow key={player.id} player={player} />
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="w-px bg-slate-700/50 flex-shrink-0" />

            {/* Bench */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-yellow-400/80 uppercase tracking-wider mb-2">
                {t('desktopPanel.bench', 'Bench')} ({subs.length})
              </h3>
              {subs.length === 0 ? (
                <p className="text-sm text-slate-500 italic">
                  {t('desktopPanel.noSubs', 'No subs')}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {subs.map(player => (
                    <PlayerRow key={player.id} player={player} dimmed />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Match Events */}
        <div className="bg-slate-900/70 p-3 rounded-lg border border-slate-700 shadow-inner">
          <h3 className="text-sm font-semibold text-yellow-400/80 uppercase tracking-wider mb-2">
            {t('desktopPanel.events', 'Events')} ({gameEvents.length})
          </h3>
          {sortedEvents.length === 0 ? (
            <p className="text-sm text-slate-500 italic">
              {t('desktopPanel.noEvents', 'No events yet')}
            </p>
          ) : (
            <div className="space-y-1">
              {sortedEvents.map(event => (
                <EventRow
                  key={event.id}
                  event={event}
                  players={availablePlayers}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Player Row ---

function PlayerRow({ player, dimmed }: { player: Player; dimmed?: boolean }) {
  return (
    <div className={`py-0.5 ${dimmed ? 'opacity-50' : ''}`}>
      <span className={`text-base ${player.isGoalie ? 'text-yellow-400' : 'text-slate-200'} truncate`}>
        {player.nickname || player.name}
      </span>
    </div>
  );
}

// --- Event Row ---

function EventRow({
  event,
  players,
  t,
}: {
  event: GameEvent;
  players: Player[];
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const { icon, label } = getEventDisplay(event, players, t);

  return (
    <div className="flex items-start gap-2 text-base py-0.5 rounded hover:bg-slate-700/30">
      <span className="text-slate-500 font-mono flex-shrink-0 w-12 text-right tabular-nums">
        {formatTime(event.time)}
      </span>
      <span className="flex-shrink-0">{icon}</span>
      <span className="text-slate-300 truncate">{label}</span>
    </div>
  );
}

type TFn = ReturnType<typeof useTranslation>['t'];

function getEventDisplay(
  event: GameEvent,
  players: Player[],
  t: TFn,
): { icon: string; label: string } {
  switch (event.type) {
    case 'goal': {
      const scorer = players.find(p => p.id === event.scorerId);
      const name = scorer?.nickname || scorer?.name || t('gameSettingsModal.unknownPlayer', 'Unknown Player');
      let label = name;
      if (event.assisterId) {
        const assister = players.find(p => p.id === event.assisterId);
        if (assister) {
          label += ` (${assister.nickname || assister.name})`;
        }
      }
      return { icon: '\u26BD', label };
    }
    case 'opponentGoal':
      return { icon: '\u26BD', label: t('gameSettingsModal.logTypeOpponentGoal', 'Opponent Goal') };
    case 'substitution':
      return { icon: '\uD83D\uDD04', label: t('desktopPanel.substitution', 'Substitution') };
    case 'fairPlayCard':
      return { icon: '\uD83D\uDFE2', label: t('desktopPanel.fairPlayCard', 'Fair Play Card') };
    case 'periodEnd':
      return { icon: '\uD83D\uDEA9', label: t('gameSettingsModal.logTypePeriodEnd', 'End of Period') };
    case 'gameEnd':
      return { icon: '\uD83C\uDFC1', label: t('gameSettingsModal.logTypeGameEnd', 'End of Game') };
    default:
      return { icon: '\u2022', label: t('gameSettingsModal.logTypeUnknown', 'Unknown Event') };
  }
}
