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

const toggleBtn = (active: boolean) =>
  `px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
    active ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
  }`;

/**
 * Position balance: a players x lines (or positions) table for the current
 * competition scope. A row shows one player's spread; a column shows who covers
 * that line. Narrow-scope players (stuck in one line) get a pill, and lines/
 * positions covered by a single player are flagged in the coverage row - so
 * positional imbalance is readable at a glance. Descriptive, compare-to-self.
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
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-lg font-semibold text-slate-200">{title}</h3>
        <div className="flex gap-1" role="group" aria-label={title}>
          <button type="button" onClick={() => setMode('lines')} className={toggleBtn(mode === 'lines')} aria-pressed={mode === 'lines'}>
            {t('gameStatsModal.positionBalance.byLines', 'Lines')}
          </button>
          <button type="button" onClick={() => setMode('positions')} className={toggleBtn(mode === 'positions')} aria-pressed={mode === 'positions'}>
            {t('gameStatsModal.positionBalance.byPositions', 'Positions')}
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        {t('gameStatsModal.positionBalance.hint', "A row is one player's spread; a column is who covers that line.")}
      </p>

      <div className="overflow-x-auto">
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
                    {/* Fixed-width slot keeps names aligned whether or not the dot shows. */}
                    <span className="shrink-0 w-2 flex justify-center">
                      {row.narrow && (
                        <span
                          role="img"
                          className="w-2 h-2 rounded-full bg-amber-400"
                          title={t('gameStatsModal.positionBalance.narrow', 'Narrow')}
                          aria-label={t('gameStatsModal.positionBalance.narrow', 'Narrow')}
                        />
                      )}
                    </span>
                    <span className="truncate">{nameOf(row.playerId)}</span>
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
