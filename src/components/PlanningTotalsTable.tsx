'use client';

import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player } from '@/types';
import type { AppState } from '@/types/game';
import type { PlanDraft } from '@/utils/planSwapEngine';
import {
  computePlanTotals,
  totalBand,
  type GkPresence,
  type TotalBand,
} from '@/utils/planTotals';
import { formatMMSS } from '@/utils/planFormatters';

export interface PlanningTotalsTableProps {
  /** Per-game drafts keyed by gameId (PR-A's foundational shape). */
  drafts: Record<string, PlanDraft>;
  /** Game order for column rendering — same as the editor's tab order. */
  gameIds: string[];
  /** Saved games for game labels + per-game duration. */
  savedGames: Record<string, AppState | undefined>;
  /** Master roster for player name lookup. */
  roster: Player[];
  /**
   * Per-game include flag. `undefined` = "all included" (NULL semantic);
   * a non-undefined array marks the included subset and excluded
   * columns get strikethrough styling + are dropped from the row total.
   */
  includedGameIds?: string[];
  /** Lifted highlight set shared with chip grid + minutes dashboard. */
  highlightedPlayerIds?: Set<string>;
  /** Click-to-toggle a single player. Optional (read-only contexts). */
  onToggleHighlight?: (playerId: string) => void;
}

// Tailwind classes per band. Aligned with the rest of the planner
// modal: emerald for "priority/on-track", amber for "needs more
// minutes". Zero-cell uses rose to flag a never-played player in an
// included game.
const totalBandClass: Record<NonNullable<TotalBand>, string> = {
  priority: 'bg-emerald-900/40 text-emerald-100 font-semibold',
  'below-half': 'bg-amber-900/40 text-amber-100',
};

const cellClassFor = (
  cell: { seconds: number; gk: GkPresence },
  isIncluded: boolean,
): string => {
  // Excluded columns: strikethrough + muted. Excluded cells contribute
  // nothing to the total, so the cell value is informational only.
  if (!isIncluded) return 'text-slate-500 line-through';
  if (cell.seconds === 0) return 'bg-rose-900/40 text-rose-100';
  return 'text-slate-100';
};

/**
 * Format the column header for game `gid`. Falls back to "G{N}" if the
 * game record is missing (cloud sync race / IndexedDB eviction). Uses
 * the opponent name when available so coaches can identify games by
 * opponent rather than just index.
 */
const gameLabel = (
  game: AppState | undefined,
  index: number,
  fallback: (n: number) => string,
): string => {
  if (!game) return fallback(index + 1);
  const opp = game.opponentName?.trim();
  return opp || fallback(index + 1);
};

const PlanningTotalsTable: React.FC<PlanningTotalsTableProps> = ({
  drafts,
  gameIds,
  savedGames,
  roster,
  includedGameIds,
  highlightedPlayerIds,
  onToggleHighlight,
}) => {
  const { t } = useTranslation();

  const includedSet = useMemo(
    () => (includedGameIds === undefined ? null : new Set(includedGameIds)),
    [includedGameIds],
  );
  // useCallback aligns with the playerLabel / matrix memoisation pattern
  // — the column-header map below recomputes each render and a stable
  // reference avoids retriggering memos in any future child consumer.
  const isIncluded = useCallback(
    (gid: string) => (includedSet === null ? true : includedSet.has(gid)),
    [includedSet],
  );

  const playerLabel = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of roster) map.set(p.id, p);
    return (id: string): string => {
      const p = map.get(id);
      // `||` so an empty-string nickname falls through to name.
      return p?.nickname || p?.name || id;
    };
  }, [roster]);

  const matrix = useMemo(
    () => computePlanTotals(drafts, gameIds, savedGames, includedGameIds),
    [drafts, gameIds, savedGames, includedGameIds],
  );

  // Sort rows by total ascending so under-played players surface
  // first (consistent with the dashboard's needs-attention-first
  // ordering). Tie-broken by playerId for stability.
  const sortedRows = useMemo(() => {
    return [...matrix.rows].sort((a, b) => {
      if (a.totalSeconds !== b.totalSeconds) {
        return a.totalSeconds - b.totalSeconds;
      }
      return a.playerId.localeCompare(b.playerId);
    });
  }, [matrix.rows]);

  if (sortedRows.length === 0) {
    return (
      <div
        className="rounded-md border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-400"
        data-testid="planning-totals-table-empty"
      >
        {t(
          'planningTotalsTable.empty',
          'Pick at least one game and assign players to see the per-game minutes.',
        )}
      </div>
    );
  }

  return (
    <div
      className="overflow-x-auto rounded-md border border-slate-700 bg-slate-900/40"
      data-testid="planning-totals-table"
      aria-labelledby="planning-totals-table-heading"
    >
      <h3
        id="planning-totals-table-heading"
        className="px-3 py-2 text-xs uppercase tracking-wider text-slate-400"
      >
        {t('planningTotalsTable.title', 'Per-game minutes')}
      </h3>
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-y border-slate-700 text-slate-400">
            <th
              scope="col"
              className="sticky left-0 z-10 bg-slate-900 px-2 py-1 text-left font-medium"
            >
              {t('planningTotalsTable.colPlayer', 'Player')}
            </th>
            {gameIds.map((gid, i) => {
              const incl = isIncluded(gid);
              const label = gameLabel(savedGames[gid], i, (n) =>
                t('planningTotalsTable.colGame', 'G{{n}}', { n }),
              );
              return (
                <th
                  key={gid}
                  scope="col"
                  data-included={incl ? 'true' : 'false'}
                  className={`px-2 py-1 text-center font-medium ${
                    incl ? '' : 'text-slate-600 line-through'
                  }`}
                  // Title shows the opponent + included-state hint so
                  // coaches reading a strikethrough column know it's
                  // intentional, not a render bug.
                  title={
                    incl
                      ? label
                      : t(
                          'planningTotalsTable.colGameExcludedTitle',
                          '{{label}} (excluded from totals)',
                          { label },
                        )
                  }
                >
                  {label}
                </th>
              );
            })}
            <th
              scope="col"
              aria-sort="ascending"
              className="px-2 py-1 text-center font-medium"
            >
              {t('planningTotalsTable.colTotal', 'Total')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const band = totalBand(row.totalSeconds, matrix.fairShareSeconds);
            const isHighlighted =
              highlightedPlayerIds?.has(row.playerId) ?? false;
            const anyActive = (highlightedPlayerIds?.size ?? 0) > 0;
            const isDimmed = anyActive && !isHighlighted;
            // Click on player-name cell toggles highlight when wired;
            // the rest of the row remains a passive numeric grid so
            // a stray cell click doesn't accidentally toggle. The
            // <button> sits inside the <th scope="row"> so list/table
            // semantics stay intact.
            return (
              <tr
                key={row.playerId}
                data-testid={`planning-totals-row-${row.playerId}`}
                data-band={band ?? 'on-track'}
                data-highlighted={isHighlighted ? 'true' : 'false'}
                className={`border-t border-slate-800 transition-opacity hover:bg-slate-800/40 ${
                  isHighlighted
                    ? 'bg-emerald-900/20'
                    : isDimmed
                      ? 'opacity-40'
                      : ''
                }`}
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 truncate bg-slate-900 px-2 py-1 text-left font-normal text-slate-100"
                >
                  {onToggleHighlight ? (
                    <button
                      type="button"
                      onClick={() => onToggleHighlight(row.playerId)}
                      aria-pressed={isHighlighted}
                      data-testid={`planning-totals-row-toggle-${row.playerId}`}
                      className="cursor-pointer text-left hover:underline"
                    >
                      {playerLabel(row.playerId)}
                    </button>
                  ) : (
                    playerLabel(row.playerId)
                  )}
                </th>
                {row.perGame.map((cell, i) => {
                  const gid = gameIds[i];
                  const incl = isIncluded(gid);
                  return (
                    <td
                      key={gid}
                      data-testid={`planning-totals-cell-${row.playerId}-${gid}`}
                      data-gk={cell.gk ?? 'no'}
                      className={`px-2 py-1 text-center font-mono tabular-nums ${cellClassFor(
                        cell,
                        incl,
                      )}`}
                    >
                      {cell.gk === 'full' && (
                        <span
                          aria-label={t(
                            'planningTotalsTable.gkFull',
                            'Goalkeeper',
                          )}
                          className="mr-1 rounded bg-amber-700/40 px-1 text-[10px] font-semibold text-amber-100"
                        >
                          GK
                        </span>
                      )}
                      {formatMMSS(cell.seconds)}
                    </td>
                  );
                })}
                <td
                  data-testid={`planning-totals-total-${row.playerId}`}
                  className={`px-2 py-1 text-center font-mono tabular-nums ${
                    band ? totalBandClass[band] : 'text-slate-100'
                  }`}
                >
                  {formatMMSS(row.totalSeconds)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default PlanningTotalsTable;
