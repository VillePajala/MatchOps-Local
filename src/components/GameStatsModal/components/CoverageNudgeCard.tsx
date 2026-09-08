'use client';

/**
 * Who has not been written about yet (Kirjuri).
 *
 * The app replaced ratings with observations, which introduced a gap nobody
 * chooses and nobody can see: the players a coach thinks about get written
 * about every week, and the quiet ones accumulate nothing. By March that is a
 * child with no record at all, and the only reason is that nothing ever said so.
 *
 * Deliberately not a judgement. It shows a count and a denominator and stops
 * there - no ranking by how a player is doing, no AI, no reading of what any
 * note says. It cannot rank anyone, because the only number it has is how many
 * notes exist. A name here means the coach has not written yet, which is a fact
 * about the record and not about the child.
 *
 * Shown only when there is something to say, and phrased so that a coach who
 * has covered everybody is told that, rather than shown an empty box.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { computeNoteCoverage, type CoverageGame } from '@/utils/noteCoverage';
import type { Player } from '@/types';

interface CoverageNudgeCardProps {
  games: CoverageGame[];
  players: Player[];
  /** How many names to show before summarising the rest. */
  limit?: number;
}

const CARD = 'bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner';

const CoverageNudgeCard: React.FC<CoverageNudgeCardProps> = ({ games, players, limit = 6 }) => {
  const { t } = useTranslation();
  const coverage = React.useMemo(() => computeNoteCoverage(games, players), [games, players]);

  // Nothing played, or nobody to write about: no denominator, so no claim.
  if (coverage.players === 0) return null;

  const shown = coverage.unwritten.slice(0, limit);
  const rest = coverage.unwritten.length - shown.length;

  return (
    <div className={CARD} data-testid="coverage-nudge">
      <h3 className="text-lg font-semibold text-slate-200 mb-1">
        {t('coverageNudge.title', 'Who you have written about')}
      </h3>
      <p className="text-sm text-slate-400 mb-3" data-testid="coverage-nudge-summary">
        {t('coverageNudge.summary', 'Notes on {{covered}} of {{total}} players over {{matches}} matches.', {
          covered: coverage.playersWithNotes,
          total: coverage.players,
          matches: coverage.matches,
        })}
      </p>

      {coverage.unwritten.length === 0 ? (
        <p className="text-sm text-emerald-300" data-testid="coverage-nudge-complete">
          {t('coverageNudge.everyone', 'Everyone in this stretch has at least one note.')}
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-2">
            {t('coverageNudge.lead', 'Nothing written yet about:')}
          </p>
          <ul className="space-y-1" data-testid="coverage-nudge-list">
            {shown.map((player) => (
              <li key={player.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-200">{player.name}</span>
                {/* The denominator is the point: no notes across eight matches
                    is a gap, no notes across one is a substitute. */}
                <span className="shrink-0 text-xs text-slate-400 tabular-nums">
                  {t('coverageNudge.matchesPlayed', '{{count}} matches', { count: player.matches })}
                </span>
              </li>
            ))}
          </ul>
          {rest > 0 && (
            <p className="mt-2 text-xs text-slate-500" data-testid="coverage-nudge-rest">
              {t('coverageNudge.andMore', 'and {{count}} more', { count: rest })}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default CoverageNudgeCard;
