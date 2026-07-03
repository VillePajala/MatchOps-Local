import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Player } from '@/types';
import type { TranslationKey } from '@/i18n-types';
import { LINES, computePositionDiversity, type DiversityGame } from '@/utils/positionDiversity';
import { POSITION_IDS, type PositionCategory } from '@/config/positions';

interface PositionBalanceSectionProps {
  /** The games in the current stats scope (each carries `playerPositions`). */
  games: DiversityGame[];
  /** Roster for resolving player names. */
  players: Player[];
}

type Mode = 'lines' | 'positions';

/** Below this share of games carrying positions, the data is too thin to trust. */
const LOW_COVERAGE = 0.5;

// Full-width segmented toggle, matching the sport/gender toggles in the app.
const toggleBtn = (active: boolean) =>
  `flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    active ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
  }`;

/**
 * Position balance: a players x lines (or positions) table for the current
 * competition scope. A row shows one player's spread; a column shows who covers
 * that line. A trailing amber dot marks narrow-scope players (stuck in one
 * line), and lines/positions covered by a single player are flagged in the
 * coverage row. A games-covered ratio shows how complete the position data is;
 * when thin, the table is greyed. Descriptive, compare-to-self.
 */
export const PositionBalanceSection: React.FC<PositionBalanceSectionProps> = ({ games, players }) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('lines');

  const diversity = useMemo(() => computePositionDiversity(games), [games]);

  const nameById = useMemo(() => new Map(players.map(p => [p.id, p.name])), [players]);
  const nameOf = (id: string) => nameById.get(id) ?? id;

  // Narrow players first, then the most concentrated, then by name - so the
  // players worth broadening surface at the top.
  const rows = useMemo(
    () =>
      [...diversity.players].sort((a, b) => {
        if (a.narrow !== b.narrow) return a.narrow ? -1 : 1;
        if (a.distinctLines !== b.distinctLines) return a.distinctLines - b.distinctLines;
        return (nameById.get(a.playerId) ?? a.playerId).localeCompare(nameById.get(b.playerId) ?? b.playerId);
      }),
    [diversity, nameById],
  );

  // In "positions" mode, only show positions that were actually played, in
  // back-to-front config order.
  const positionCols = useMemo(() => {
    const seen = new Set<string>();
    diversity.players.forEach(p => Object.keys(p.byPosition).forEach(id => seen.add(id)));
    return POSITION_IDS.filter(id => seen.has(id));
  }, [diversity]);

  const title = t('gameStatsModal.positionBalance.title', 'Position balance');

  if (diversity.totalGames === 0 || rows.length === 0) {
    return (
      <section className="bg-gradient-to-br from-slate-900/60 to-slate-800/40 p-4 rounded-lg border border-slate-700 shadow-inner">
        <h3 className="text-lg font-semibold text-slate-200 mb-2">{title}</h3>
        <p className="text-sm text-slate-400">
          {t('gameStatsModal.positionBalance.empty', 'No positions recorded yet for this selection.')}
        </p>
      </section>
    );
  }

  const scopeGames = games.length;
  const lowCoverage = scopeGames > 0 && diversity.totalGames / scopeGames < LOW_COVERAGE;

  const cols: Array<{ key: string; label: string }> =
    mode === 'lines'
      ? LINES.map(line => ({
          key: line,
          label: t(`gameStatsModal.positionBalance.line.${line}` as TranslationKey, line.toUpperCase()),
        }))
      : positionCols.map(id => ({
          key: id,
          label: t(`playingPositions.${id}.abbrev` as TranslationKey, id.toUpperCase()),
        }));

  const cellCount = (row: (typeof rows)[number], key: string) =>
    mode === 'lines' ? row.byLine[key as PositionCategory] : row.byPosition[key] ?? 0;
  const coverageCount = (key: string) =>
    mode === 'lines' ? diversity.lineCoverage[key as PositionCategory] : diversity.positionCoverage[key] ?? 0;

  return (
    <section className="bg-gradient-to-br from-slate-900/60 to-slate-800/40 p-4 rounded-lg border border-slate-700 shadow-inner">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-lg font-semibold text-slate-200">{title}</h3>
        <span
          className="shrink-0 text-xs text-slate-400 tabular-nums"
          title={t('gameStatsModal.positionBalance.coverageTooltip', 'Games with positions recorded, of games in this view')}
        >
          {diversity.totalGames}/{scopeGames}
        </span>
      </div>

      {/* Full-width edge-to-edge Lines / Positions toggle. */}
      <div className="flex gap-2 mb-3" role="group" aria-label={title}>
        <button type="button" onClick={() => setMode('lines')} className={toggleBtn(mode === 'lines')} aria-pressed={mode === 'lines'}>
          {t('gameStatsModal.positionBalance.byLines', 'Lines')}
        </button>
        <button type="button" onClick={() => setMode('positions')} className={toggleBtn(mode === 'positions')} aria-pressed={mode === 'positions'}>
          {t('gameStatsModal.positionBalance.byPositions', 'Positions')}
        </button>
      </div>

      <div className={`overflow-x-auto ${lowCoverage ? 'opacity-60' : ''}`}>
        <table className="w-full text-sm">
          <thead className="text-slate-300">
            <tr className="border-b border-slate-700">
              <th className="px-2 py-2 text-left font-medium">
                {t('gameStatsModal.positionBalance.player', 'Player')}
              </th>
              {cols.map(c => (
                <th key={c.key} className="px-0.5 py-2 text-center font-medium min-w-[2.75rem]">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-100">
            {rows.map(row => (
              <tr key={row.playerId} className="border-b border-slate-800 hover:bg-slate-800/40">
                <td className="px-2 py-2 font-medium">
                  <span className="flex items-center gap-2">
                    <span className="truncate">{nameOf(row.playerId)}</span>
                    {row.narrow && (
                      <span
                        role="img"
                        className="shrink-0 w-2 h-2 rounded-full bg-amber-400"
                        title={t('gameStatsModal.positionBalance.narrow', 'Narrow')}
                        aria-label={t('gameStatsModal.positionBalance.narrow', 'Narrow')}
                      />
                    )}
                  </span>
                </td>
                {cols.map(c => {
                  const n = cellCount(row, c.key);
                  return (
                    <td
                      key={c.key}
                      className={`px-0.5 py-2 text-center ${n > 0 ? 'text-yellow-400 font-semibold' : 'text-slate-600'}`}
                    >
                      {n > 0 ? n : '–'}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* Coverage: how many distinct players filled each column. A single
                player (amber) means that spot is monopolized / unrehearsed. */}
            <tr className="border-t border-slate-700 bg-slate-800/50 text-xs text-slate-300">
              <td className="px-2 py-2 font-medium">
                {t('gameStatsModal.positionBalance.coverage', 'Players')}
              </td>
              {cols.map(c => {
                const cov = coverageCount(c.key);
                return (
                  <td
                    key={c.key}
                    className={`px-0.5 py-2 text-center font-semibold ${
                      cov === 1 ? 'text-amber-300' : cov === 0 ? 'text-slate-600' : 'text-slate-300'
                    }`}
                  >
                    {cov}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default PositionBalanceSection;
