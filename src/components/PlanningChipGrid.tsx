'use client';

import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineXMark } from 'react-icons/hi2';
import type { Player } from '@/types';
import type { AppState, SavedGamesCollection } from '@/types/game';
import type { FormationPreset } from '@/config/formationPresets';
import type {
  DraftScheduledSub,
  PlanDraft,
  PlayerId,
} from '@/utils/planSwapEngine';
import { getRoleSegments } from '@/utils/planFairness';
import { formatMMSS, gameDurationSec } from '@/utils/planFormatters';

export interface PlanningChipGridProps {
  /**
   * Per-game drafts keyed by gameId (PR-A's foundational shape). Each
   * card reads `drafts[gid]` so cross-game role views actually reflect
   * each game's own lineup. Falling back to an empty draft when a
   * gameId is missing keeps the card render path total.
   */
  drafts: Record<string, PlanDraft>;
  preset: FormationPreset;
  gameIds: string[];
  savedGames: SavedGamesCollection;
  roster: Player[];
  /** Lifted highlight state — shared with MinutesDashboard + TotalsTable. */
  highlightedPlayerIds: Set<PlayerId>;
  /** Toggle a single player in the highlighted set. */
  onToggleHighlight: (playerId: PlayerId) => void;
  /** Drop the entire highlighted set. */
  onClearHighlight: () => void;
}

// Frozen so a future caller mutating the fallback draft can't silently
// corrupt every render that hits the sparse-draft branch. getRoleSegments
// only reads these arrays today, but the freeze locks the contract.
const EMPTY_DRAFT: PlanDraft = Object.freeze({
  startingXI: Object.freeze({}) as Record<string, PlayerId>,
  bench: Object.freeze([]) as readonly PlayerId[] as PlayerId[],
  scheduledSubs: Object.freeze([]) as readonly DraftScheduledSub[] as DraftScheduledSub[],
}) as PlanDraft;

const PlanningChipGrid: React.FC<PlanningChipGridProps> = ({
  drafts,
  preset,
  gameIds,
  savedGames,
  roster,
  highlightedPlayerIds,
  onToggleHighlight,
  onClearHighlight,
}) => {
  const { t, i18n } = useTranslation();

  const playerMap = useMemo(
    () => new Map(roster.map((p) => [p.id, p])),
    [roster],
  );
  const playerLabel = useCallback(
    (id: PlayerId): string => {
      const p = playerMap.get(id);
      // `||` (not `??`) so an empty-string nickname falls through to
      // `name` rather than rendering an empty chip.
      return p?.nickname || p?.name || id;
    },
    [playerMap],
  );
  const isPriorityPlayer = useCallback(
    (id: PlayerId): boolean => playerMap.get(id)?.isPriority === true,
    [playerMap],
  );

  // Highlight state is now lifted to PlanningEditor so the same
  // selection drives chips, dashboard pills, and totals-table rows
  // simultaneously. Empty set = no focus mode (everything renders at
  // full opacity); non-empty = highlighted glow + non-highlighted dim.
  const highlighted = highlightedPlayerIds;
  const anyActive = highlighted.size > 0;

  const roles = preset.roles ?? [];

  const gameLabel = useCallback(
    (gameId: string): string => {
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
    },
    [savedGames, t, i18n.language],
  );

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
            onClick={onClearHighlight}
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
          // Per-game draft lookup. Falls back to EMPTY_DRAFT for any
          // gameId without an entry — the card still renders, with
          // every role showing the "—" placeholder. Matches the
          // sparse-draft handling in planTotals + PlanningEditor's
          // lazy-seed pattern.
          const cardDraft = drafts[gid] ?? EMPTY_DRAFT;
          return (
            <li
              key={gid}
              className="rounded-md border border-slate-700 bg-slate-800/40 p-2"
              data-testid={`planning-chip-grid-card-${gid}`}
            >
              {/* Plain div rather than <header> — landmark element
                  inside <li> can confuse screen-reader navigation,
                  and the outer <section aria-labelledby> already
                  carries the structural semantics. */}
              <div className="mb-1 text-xs font-medium text-slate-200">
                {gameLabel(gid)}
              </div>
              <ul className="space-y-1" role="list">
                {roles.map((role) => {
                  const segs = getRoleSegments(cardDraft, role.name, dur);
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
                        const isPriority = isPriorityPlayer(seg.playerId);
                        // Bake "Priority " prefix into the AT label
                        // when the flag is set so the visual ★ glyph
                        // (decorative, aria-hidden) doesn't get
                        // announced as "star" or "white star" by
                        // screen readers.
                        const chipText = isPriority
                          ? t(
                              'planningChipGrid.chipAriaPriority',
                              'Priority {{player}} from {{from}} to {{to}}',
                              {
                                player: playerLabel(seg.playerId),
                                from: formatMMSS(seg.startSec),
                                to: formatMMSS(seg.endSec),
                              },
                            )
                          : t(
                              'planningChipGrid.chipAria',
                              '{{player}} from {{from}} to {{to}}',
                              {
                                player: playerLabel(seg.playerId),
                                from: formatMMSS(seg.startSec),
                                to: formatMMSS(seg.endSec),
                              },
                            );
                        return (
                          <button
                            // Role name in the key guards the (today
                            // impossible, tomorrow maybe) case where
                            // the same player appears in two roles
                            // starting at the same time.
                            key={`${role.name}-${seg.playerId}-${seg.startSec}`}
                            type="button"
                            onClick={() => onToggleHighlight(seg.playerId)}
                            aria-pressed={isHighlighted}
                            // Same translated string for both AT and
                            // sighted hover so the two never drift in
                            // any locale.
                            aria-label={chipText}
                            title={chipText}
                            data-player-id={seg.playerId}
                            data-priority={isPriority ? 'true' : 'false'}
                            data-highlighted={isHighlighted ? 'true' : 'false'}
                            data-testid={`planning-chip-grid-chip-${gid}-${role.name}-${seg.playerId}`}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium transition-colors ${chipClass}`}
                          >
                            {isPriority && (
                              <span aria-hidden="true" className="text-amber-300">
                                ★
                              </span>
                            )}
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
