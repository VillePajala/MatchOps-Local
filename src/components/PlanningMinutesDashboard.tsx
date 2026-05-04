'use client';

import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player } from '@/types';
import type { SavedGamesCollection } from '@/types/game';
import type { PlanDraft } from '@/utils/planSwapEngine';
import {
  aggregatePlanMinutes,
  fairShareBand,
  fairShareHue,
} from '@/utils/planMinutesAggregate';
import { formatMMSS } from '@/utils/planFormatters';

export interface PlanningMinutesDashboardProps {
  /**
   * Either a single PlanDraft (legacy: same lineup across every gameId)
   * or a per-game Record (rebuild: each game has its own draft).
   * `aggregatePlanMinutes` discriminates internally and reads the
   * right entry per gameId.
   */
  draft: PlanDraft | Record<string, PlanDraft>;
  gameIds: string[];
  savedGames: SavedGamesCollection;
  roster: Player[];
  /**
   * Lifted highlight set shared with PlanningChipGrid + PlanningTotalsTable.
   * Optional so the dashboard can be used standalone (e.g. in tests
   * or future read-only contexts) without forcing the host to thread
   * the state through.
   */
  highlightedPlayerIds?: Set<string>;
  /** Click-to-toggle a single player. Optional (paired with highlightedPlayerIds). */
  onToggleHighlight?: (playerId: string) => void;
}

// Continuous-gradient pill style. Mirrors the standalone planner's
// red→yellow→green hue ramp (see fairShareHue) so coaches reading the
// in-app dashboard see the same color a player would have in the
// standalone tool. Saturation/lightness tuned for the dark theme:
//   - bg:     30% lightness, 50% saturation → readable but muted
//   - border: 42% lightness, 65% saturation → strong-enough rim
//   - text:   95% lightness                  → near-white, AAA contrast
// Dark-theme inversion vs. the standalone (which uses 92% bg lightness
// because it runs on white) is intentional — the planner modal is
// dark-themed everywhere else, swapping to a light pill would clash.
const pillStyleForRatio = (ratio: number): React.CSSProperties => {
  const hue = fairShareHue(ratio);
  return {
    backgroundColor: `hsl(${hue}, 50%, 30%)`,
    borderColor: `hsl(${hue}, 65%, 42%)`,
    color: `hsl(${hue}, 30%, 95%)`,
  };
};

// Note: the discrete `data-band` attribute on each <li> stays as the
// machine-readable classification (used by existing tests and AT
// consumers). The visual rendering is the gradient above; the band
// continues to back any future per-band CSS rules or filters.

const PlanningMinutesDashboard: React.FC<PlanningMinutesDashboardProps> = ({
  draft,
  gameIds,
  savedGames,
  roster,
  highlightedPlayerIds,
  onToggleHighlight,
}) => {
  const { t } = useTranslation();

  const playerMap = useMemo(
    () => new Map(roster.map((p) => [p.id, p])),
    [roster],
  );
  const playerLabel = useCallback(
    (id: string): string => {
      const p = playerMap.get(id);
      // `||` (not `??`) so an empty-string nickname falls through to
      // `name` rather than rendering an empty pill.
      return p?.nickname || p?.name || id;
    },
    [playerMap],
  );
  const isPriorityPlayer = useCallback(
    (id: string): boolean => playerMap.get(id)?.isPriority === true,
    [playerMap],
  );

  const aggregate = useMemo(
    () => aggregatePlanMinutes(draft, gameIds, savedGames),
    [draft, gameIds, savedGames],
  );

  // Sort ascending by minutes — needs-attention-first. Mirrors the
  // standalone's "needs attention at the top" ordering so coaches see
  // the under-played player first when they glance at the dashboard.
  // Was previously desc (over-played at top); the gradient + ascending
  // ordering gives the same information at a glance with the more
  // actionable player visible without scrolling.
  const sorted = useMemo(
    () =>
      [...aggregate.perPlayer].sort(
        (a, b) => a.totalSeconds - b.totalSeconds,
      ),
    [aggregate],
  );

  // perPlayer === [] also covers the gameIds: [] case via
  // aggregatePlanMinutes' early exit, so a single check captures
  // both empty-input paths.
  if (aggregate.perPlayer.length === 0) {
    return (
      <div
        className="rounded-md border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-400"
        data-testid="planning-minutes-dashboard-empty"
      >
        {t(
          'planningMinutesDashboard.empty',
          'Pick at least one game and assign players to a starting XI to see the minutes breakdown.',
        )}
      </div>
    );
  }

  return (
    <section
      className="space-y-2 rounded-md border border-slate-700 bg-slate-900/40 p-3"
      data-testid="planning-minutes-dashboard"
      aria-labelledby="planning-minutes-dashboard-heading"
    >
      <header className="flex items-baseline justify-between">
        <h3
          id="planning-minutes-dashboard-heading"
          className="text-xs uppercase tracking-wider text-slate-400"
        >
          {t('planningMinutesDashboard.title', 'Plan minutes')}
        </h3>
        <span className="text-[10px] text-slate-500">
          {t(
            'planningMinutesDashboard.fairShare',
            'Fair share: {{mmss}}',
            { mmss: formatMMSS(aggregate.fairShareSeconds) },
          )}
        </span>
      </header>
      <ul
        // Tailwind preflight strips list-style; Safari VoiceOver and
        // some NVDA configs then drop the implicit list semantic.
        // Explicit role="list" keeps AT users hearing "list, N items".
        role="list"
        className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-3"
        data-testid="planning-minutes-dashboard-grid"
      >
        {sorted.map((entry) => {
          const band = fairShareBand(entry.shareRatio);
          const pct = Math.round(entry.shareRatio * 100);
          const isPriority = isPriorityPlayer(entry.playerId);
          // Single string used for both `title` (sighted hover) and
          // `aria-label` (AT announcement) so the two never drift.
          // Priority gets a "Priority " prefix so the visual ★ glyph
          // (decorative, aria-hidden) doesn't get announced as "star".
          const ariaLabel = isPriority
            ? t(
                'planningMinutesDashboard.entryAriaPriority',
                'Priority {{player}}: {{mmss}}, {{pct}} percent of fair share',
                {
                  player: playerLabel(entry.playerId),
                  mmss: formatMMSS(entry.totalSeconds),
                  pct,
                },
              )
            : t(
                'planningMinutesDashboard.entryAria',
                '{{player}}: {{mmss}}, {{pct}} percent of fair share',
                {
                  player: playerLabel(entry.playerId),
                  mmss: formatMMSS(entry.totalSeconds),
                  pct,
                },
              );
          // Highlight integration: when any player is highlighted, the
          // pill either glows (highlighted) or dims to ~40% opacity
          // (non-highlighted). Empty highlighted set = no focus mode,
          // every pill renders at full opacity.
          const isHighlighted =
            highlightedPlayerIds?.has(entry.playerId) ?? false;
          const anyActive = (highlightedPlayerIds?.size ?? 0) > 0;
          const isDimmed = anyActive && !isHighlighted;
          // Inner button wraps the pill content so list semantics
          // stay intact (<button> inside <ul> would break "list of N
          // items" announcement). The <li> remains a passive
          // structural item; the <button> carries the click handler
          // and aria-pressed when toggle is wired.
          const content = (
            <>
              {/* min-w-0 lets the flex container shrink below its
                  intrinsic content width so the inner truncate can
                  fire — `truncate` (overflow-hidden + ellipsis) on
                  the outer is dead code in flex without it. */}
              <span className="flex min-w-0 items-center gap-1">
                {isPriority && (
                  <span aria-hidden="true" className="text-amber-300">
                    ★
                  </span>
                )}
                <span className="truncate">{playerLabel(entry.playerId)}</span>
              </span>
              <span className="font-mono text-[11px] tabular-nums">
                {formatMMSS(entry.totalSeconds)} ({pct}%)
              </span>
            </>
          );
          const className = `flex items-center justify-between rounded-md border px-2 py-1 transition-opacity ${
            isHighlighted
              ? 'ring-2 ring-emerald-300/70'
              : isDimmed
                ? 'opacity-40'
                : ''
          } ${onToggleHighlight ? 'cursor-pointer text-left w-full' : ''}`;
          // aria-label + style are duplicated on the outer <li> AND
          // the inner interactive element so:
          //   1. AT reading the list item still gets the player+mmss+pct
          //      announcement (matches pre-PR-B-3 behaviour).
          //   2. The inner <button> inherits the same label as its
          //      accessible name when the toggle is wired (interactive
          //      label = content label).
          //   3. Tests that query the outer <li> for style/aria-label
          //      don't need to reach into the inner element.
          // Browsers/AT dedupe duplicate labels in announcement, so the
          // duplication is invisible to users.
          return (
            <li
              key={entry.playerId}
              data-testid={`planning-minutes-dashboard-entry-${entry.playerId}`}
              data-band={band}
              data-priority={isPriority ? 'true' : 'false'}
              data-highlighted={isHighlighted ? 'true' : 'false'}
              aria-label={ariaLabel}
              title={ariaLabel}
              style={pillStyleForRatio(entry.shareRatio)}
            >
              {onToggleHighlight ? (
                <button
                  type="button"
                  onClick={() => onToggleHighlight(entry.playerId)}
                  aria-pressed={isHighlighted}
                  aria-label={ariaLabel}
                  className={className}
                >
                  {content}
                </button>
              ) : (
                <div className={className}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default PlanningMinutesDashboard;
