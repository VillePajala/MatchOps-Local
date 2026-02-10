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
 * Desktop-only side panel shown next to the field on lg+ screens.
 * Displays match info, game details, match squad, and match event feed.
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

  // Build detail items (only show non-empty values)
  const detailItems: { label: string; value: string }[] = [];
  if (formattedDate) {
    const dateValue = gameTime ? `${formattedDate} ${gameTime}` : formattedDate;
    detailItems.push({ label: t('gameSettingsModal.gameDateLabel', 'Game Date'), value: dateValue });
  }
  if (gameLocation) {
    detailItems.push({ label: t('gameSettingsModal.locationLabel', 'Location'), value: gameLocation });
  }
  if (seasonName) {
    detailItems.push({ label: t('gameSettingsModal.kausi', 'Season'), value: seasonName });
  }
  if (tournamentName) {
    detailItems.push({ label: t('gameSettingsModal.turnaus', 'Tournament'), value: tournamentName });
  }
  if (leagueName) {
    detailItems.push({ label: t('gameSettingsModal.leagueLabel', 'League'), value: leagueName });
  }
  if (ageGroup) {
    detailItems.push({ label: t('gameSettingsModal.ageGroupLabel', 'Age Group'), value: ageGroup });
  }
  detailItems.push({
    label: t('gameSettingsModal.periodsLabel', 'Periods'),
    value: `${numberOfPeriods} \u00D7 ${periodDurationMinutes} min`,
  });

  return (
    <aside className="hidden lg:flex lg:flex-col w-80 xl:w-96 flex-shrink-0 overflow-hidden relative bg-gradient-to-b from-slate-800 to-slate-800/85 border-l border-slate-700/50">
      {/* Signature gradient overlays matching GameInfoBar / PlayerBar */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
      <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />

      {/* Match Info - Score & Timer */}
      <div className="relative px-4 py-3 border-b border-slate-700/50">
        <div className="text-sm text-slate-400 mb-1.5 text-center uppercase tracking-wider">{statusLabel}</div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-base font-semibold text-slate-200 truncate flex-1 text-right">
            {leftTeam || t('common.team', 'Team')}
          </span>
          <span className="bg-slate-700 px-3 py-0.5 rounded text-yellow-300 text-base font-bold flex-shrink-0 tabular-nums">
            {leftScore} - {rightScore}
          </span>
          <span className="text-base font-semibold text-slate-200 truncate flex-1 text-left">
            {rightTeam || t('common.opponent', 'Opponent')}
          </span>
        </div>
        <div className="text-center text-base font-mono text-slate-300 mt-1">
          {formatTime(timeElapsedInSeconds)}
        </div>
      </div>

      {/* Game Details */}
      {detailItems.length > 0 && (
        <div className="relative px-4 py-2.5 border-b border-slate-700/50">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {detailItems.map(item => (
              <div key={item.label} className="min-w-0">
                <div className="text-xs text-slate-500 uppercase tracking-wider leading-tight">{item.label}</div>
                <div className="text-sm text-slate-300 truncate">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game Stats Summary */}
      {hasStats && (
        <div className="relative px-4 py-2.5 border-b border-slate-700/50">
          <div className="flex items-center gap-4 text-sm">
            {subCount > 0 && (
              <span className="text-slate-400" title={t('desktopPanel.substitution', 'Substitution')}>
                {'\uD83D\uDD04'} {subCount}
              </span>
            )}
            {fairPlayCount > 0 && (
              <span className="text-slate-400" title={t('desktopPanel.fairPlayCard', 'Fair Play Card')}>
                {'\uD83D\uDFE2'} {fairPlayCount}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Game Notes */}
      {gameNotes && (
        <div className="relative px-4 py-2.5 border-b border-slate-700/50 max-h-32 overflow-y-auto">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 sticky top-0">
            {t('gameSettingsModal.notesTitle', 'Game Notes')}
          </h3>
          <p className="text-sm text-slate-300 whitespace-pre-line">{gameNotes}</p>
        </div>
      )}

      {/* Match Squad — on-field left, bench right */}
      <div className="relative flex-1 flex min-h-0 border-b border-slate-700/50 overflow-hidden">
        {/* On Field column */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-slate-700/30">
          <div className="px-3 py-2 flex-shrink-0">
            <h3 className="text-sm font-semibold text-yellow-400/80 uppercase tracking-wider">
              {t('desktopPanel.onField', 'On Field')} ({onFieldFormation.length})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-1">
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
        </div>

        {/* Bench column */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-3 py-2 flex-shrink-0">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              {t('desktopPanel.bench', 'Bench')} ({subs.length})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-1">
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
      <div className="relative flex-1 flex flex-col min-h-0">
        <div className="px-4 py-2 flex-shrink-0">
          <h3 className="text-sm font-semibold text-yellow-400/80 uppercase tracking-wider">
            {t('desktopPanel.events', 'Events')} ({gameEvents.length})
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          {sortedEvents.length === 0 ? (
            <p className="text-sm text-slate-500 italic px-1">
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
    </aside>
  );
}

// --- Player Row ---

function PlayerRow({ player, dimmed }: { player: Player; dimmed?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 px-1 py-0.5 rounded ${
        dimmed ? 'opacity-60' : ''
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          player.isGoalie
            ? 'bg-yellow-400'
            : 'bg-slate-500'
        }`}
      />
      <span className="text-sm text-slate-200 truncate">
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
    <div className="flex items-start gap-2 text-sm px-1 py-0.5 rounded hover:bg-slate-700/30">
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
