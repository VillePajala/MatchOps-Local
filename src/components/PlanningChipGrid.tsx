'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineXMark } from 'react-icons/hi2';
import type { Player } from '@/types';
import type { AppState, SavedGamesCollection } from '@/types/game';
import type { FormationPreset } from '@/config/formationPresets';
import type { PlanDraft, PlayerId } from '@/utils/planSwapEngine';
import { getRoleSegments } from '@/utils/planFairness';

export interface PlanningChipGridProps {
  draft: PlanDraft;
  preset: FormationPreset;
  gameIds: string[];
  savedGames: SavedGamesCollection;
  roster: Player[];
}

const formatMMSS = (totalSec: number): string => {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const gameDurationSec = (game: AppState): number => {
  const periods = game.numberOfPeriods ?? 2;
  const minutes = game.periodDurationMinutes ?? 10;
  return Math.max(0, periods * minutes * 60);
};

const PlanningChipGrid: React.FC<PlanningChipGridProps> = ({
  draft,
  preset,
  gameIds,
  savedGames,
  roster,
}) => {
  const { t, i18n } = useTranslation();

  const playerMap = useMemo(
    () => new Map(roster.map((p) => [p.id, p])),
    [roster],
  );
  const playerLabel = (id: PlayerId): string => {
    const p = playerMap.get(id);
    return p?.nickname || p?.name || id;
  };

  // Multi-select highlight set. Click a chip → toggle that player.
  // Clear button resets the whole set. Empty set = no focus mode.
  const [highlighted, setHighlighted] = useState<Set<PlayerId>>(new Set());
  const togglePlayer = (id: PlayerId) =>
    setHighlighted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearHighlight = () => setHighlighted(new Set());

  const anyActive = highlighted.size > 0;

  const roles = preset.roles ?? [];

  const gameLabel = (gameId: string): string => {
    const game: AppState | undefined = savedGames[gameId];
    if (!game) return t('planningChipGrid.gameMissing', 'Game ({{id}})', { id: gameId });
    const opp = game.opponentName || '';
    let date = '';
    if (game.gameDate) {
      const parsed = new Date(game.gameDate);
      if (!Number.isNaN(parsed.getTime())) {
        date = parsed.toLocaleDateString(i18n.language);
      }
    }
    if (opp && date) return `${opp} · ${date}`;
    return opp || date || gameId;
  };

  if (gameIds.length === 0 || roles.length === 0) {
    return (
      <div
        className="rounded-md border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-400"
        data-testid="planning-chip-grid-empty"
      >
        {t(
          'planningChipGrid.empty',
          'Pick at least one game and a formation to see the per-game chip view.',
        )}
      </div>
    );
  }

  return (
    <section
      className="space-y-3 rounded-md border border-slate-700 bg-slate-900/40 p-3"
      data-testid="planning-chip-grid"
      aria-labelledby="planning-chip-grid-heading"
    >
      <header className="flex items-center justify-between gap-3">
        <h3
          id="planning-chip-grid-heading"
          className="text-xs uppercase tracking-wider text-slate-400"
        >
          {t('planningChipGrid.title', 'Per-game chip view')}
        </h3>
        {anyActive && (
          <button
            type="button"
            onClick={clearHighlight}
            className="inline-flex items-center gap-1 rounded-md bg-slate-700 px-2 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-600"
            data-testid="planning-chip-grid-clear"
          >
            <HiOutlineXMark aria-hidden="true" className="h-3 w-3" />
            {t(
              'planningChipGrid.clearHighlight',
              'Clear highlight ({{count}})',
              { count: highlighted.size },
            )}
          </button>
        )}
      </header>

      <ul className="space-y-2" role="list">
        {gameIds.map((gid) => {
          const game = savedGames[gid];
          if (!game) {
            return (
              <li
                key={gid}
                className="rounded-md border border-rose-700/40 bg-rose-900/20 px-3 py-2 text-xs text-rose-100"
                data-testid={`planning-chip-grid-card-missing-${gid}`}
              >
                {gameLabel(gid)}
              </li>
            );
          }
          const dur = gameDurationSec(game);
          return (
            <li
              key={gid}
              className="rounded-md border border-slate-700 bg-slate-800/40 p-2"
              data-testid={`planning-chip-grid-card-${gid}`}
            >
              <header className="mb-1 text-xs font-medium text-slate-200">
                {gameLabel(gid)}
              </header>
              <ul className="space-y-1" role="list">
                {roles.map((role) => {
                  const segs = getRoleSegments(draft, role.name, dur);
                  if (segs.length === 0) {
                    // Role unassigned in the draft — render the row
                    // anyway so the user can still scan the formation
                    // shape. Subtle "—" placeholder marks it.
                    return (
                      <li
                        key={role.name}
                        className="flex items-center gap-1.5 text-xs"
                        data-testid={`planning-chip-grid-role-${gid}-${role.name}`}
                      >
                        <span className="w-12 flex-shrink-0 truncate text-slate-400">
                          {role.name}
                        </span>
                        <span className="text-slate-600">—</span>
                      </li>
                    );
                  }
                  return (
                    <li
                      key={role.name}
                      className="flex flex-wrap items-center gap-1.5 text-xs"
                      data-testid={`planning-chip-grid-role-${gid}-${role.name}`}
                    >
                      <span className="w-12 flex-shrink-0 truncate text-slate-400">
                        {role.name}
                      </span>
                      {segs.map((seg) => {
                        const isHighlighted = highlighted.has(seg.playerId);
                        const isDimmed = anyActive && !isHighlighted;
                        const chipClass = isHighlighted
                          ? 'border-emerald-400 bg-emerald-900/40 text-emerald-50 ring-1 ring-emerald-300/60'
                          : isDimmed
                            ? 'border-slate-700 bg-slate-800/40 text-slate-500 opacity-60'
                            : 'border-slate-600 bg-slate-700/60 text-slate-100 hover:bg-slate-600/60';
                        const label = `${playerLabel(seg.playerId)} ${formatMMSS(seg.startSec)}–${formatMMSS(seg.endSec)}`;
                        return (
                          <button
                            key={`${seg.playerId}-${seg.startSec}`}
                            type="button"
                            onClick={() => togglePlayer(seg.playerId)}
                            aria-pressed={isHighlighted}
                            aria-label={t(
                              'planningChipGrid.chipAria',
                              '{{player}} from {{from}} to {{to}}',
                              {
                                player: playerLabel(seg.playerId),
                                from: formatMMSS(seg.startSec),
                                to: formatMMSS(seg.endSec),
                              },
                            )}
                            title={label}
                            data-player-id={seg.playerId}
                            data-highlighted={isHighlighted ? 'true' : 'false'}
                            data-testid={`planning-chip-grid-chip-${gid}-${role.name}-${seg.playerId}`}
                            className={`rounded-md border px-2 py-0.5 font-medium transition-colors ${chipClass}`}
                          >
                            <span className="truncate">
                              {playerLabel(seg.playerId)}
                            </span>
                          </button>
                        );
                      })}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default PlanningChipGrid;
