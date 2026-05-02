'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineExclamationTriangle } from 'react-icons/hi2';
import type { Player } from '@/types';
import type { AppState, SavedGamesCollection } from '@/types/game';
import {
  countDiffChanges,
  type ApplyDiff,
  type LineupAddChange,
  type LineupMoveChange,
  type LineupRemoveChange,
  type SubDiffEntry,
  type SubModifyChange,
} from '@/utils/applyPreview';

export interface PlanningApplyPreviewProps {
  /** Per-game diffs precomputed by the parent. Keyed order = render order. */
  diffs: ApplyDiff[];
  /** Saved games — used to label each card with date/opponent. */
  savedGames: SavedGamesCollection;
  /** Master roster — used to render player ids as names. */
  roster: Player[];
  /** True while the parent is awaiting persistence. Disables Confirm. */
  isApplying: boolean;
  /** Called with the gameIds the user kept checked. */
  onConfirm: (checkedGameIds: string[]) => void;
  /** Called when the user cancels the preview. */
  onCancel: () => void;
}

/** mm:ss without leading zeros on minutes. */
const formatTime = (totalSec: number): string => {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const PlanningApplyPreview: React.FC<PlanningApplyPreviewProps> = ({
  diffs,
  savedGames,
  roster,
  isApplying,
  onConfirm,
  onCancel,
}) => {
  const { t, i18n } = useTranslation();

  const playerLabel = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of roster) map.set(p.id, p);
    return (id: string): string => {
      const p = map.get(id);
      return p?.nickname || p?.name || id;
    };
  }, [roster]);

  // Default: every non-empty game starts checked. Empty-diff games are
  // hidden entirely (the preview surfaces only what would change), so
  // the checkbox state only tracks games with at least one change.
  const initialChecked = useMemo(() => {
    const s = new Set<string>();
    for (const d of diffs) if (!d.isEmpty) s.add(d.gameId);
    return s;
  }, [diffs]);
  const [checked, setChecked] = useState<Set<string>>(initialChecked);

  const toggleGame = (gameId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  };

  const visibleDiffs = diffs.filter((d) => !d.isEmpty);
  const checkedCount = checked.size;

  const renderRoleLabel = (role: string | undefined): string =>
    role ?? t('planningApplyPreview.offFormation', 'off-formation');

  const renderLineupAdded = (c: LineupAddChange): string =>
    t('planningApplyPreview.lineupAdded', 'Add {{player}} at {{role}}', {
      player: playerLabel(c.playerId),
      role: c.role,
    });

  const renderLineupRemoved = (c: LineupRemoveChange): string =>
    c.role
      ? t(
          'planningApplyPreview.lineupRemoved',
          'Remove {{player}} from {{role}}',
          { player: playerLabel(c.playerId), role: c.role },
        )
      : t(
          'planningApplyPreview.lineupRemovedOffFormation',
          'Remove {{player}} ({{role}})',
          {
            player: playerLabel(c.playerId),
            role: renderRoleLabel(undefined),
          },
        );

  const renderLineupMoved = (c: LineupMoveChange): string =>
    t(
      'planningApplyPreview.lineupMoved',
      'Move {{player}} from {{from}} to {{to}}',
      {
        player: playerLabel(c.playerId),
        from: c.fromRole,
        to: c.toRole,
      },
    );

  const renderSubAdded = (s: Omit<SubDiffEntry, 'outPlayer'>): string =>
    t(
      'planningApplyPreview.subAdded',
      'Schedule sub at {{time}}: {{player}} on at {{role}}',
      {
        time: formatTime(s.timeSeconds),
        player: playerLabel(s.inPlayer),
        role: s.positionRole,
      },
    );

  const renderSubRemoved = (s: SubDiffEntry): string =>
    t(
      'planningApplyPreview.subRemoved',
      'Cancel sub at {{time}}: {{player}} on at {{role}}',
      {
        time: formatTime(s.timeSeconds),
        player: playerLabel(s.inPlayer),
        role: s.positionRole,
      },
    );

  const renderSubModified = (m: SubModifyChange): string =>
    t(
      'planningApplyPreview.subModified',
      'Update sub: {{before}} → {{after}}',
      {
        before: t(
          'planningApplyPreview.subRef',
          '{{time}} {{player}} {{role}}',
          {
            time: formatTime(m.before.timeSeconds),
            player: playerLabel(m.before.inPlayer),
            role: m.before.positionRole,
          },
        ),
        after: t(
          'planningApplyPreview.subRef',
          '{{time}} {{player}} {{role}}',
          {
            time: formatTime(m.after.timeSeconds),
            player: playerLabel(m.after.inPlayer),
            role: m.after.positionRole,
          },
        ),
      },
    );

  const gameLabel = (gameId: string): string => {
    const game: AppState | undefined = savedGames[gameId];
    if (!game) {
      return t('planningApplyPreview.gameMissing', 'Game ({{id}})', {
        id: gameId,
      });
    }
    const opp = game.opponentName || '';
    const date = game.gameDate
      ? new Date(game.gameDate).toLocaleDateString(i18n.language)
      : '';
    if (opp && date) return `${opp} · ${date}`;
    return opp || date || gameId;
  };

  return (
    <div
      className="space-y-3 rounded-md border border-slate-700 bg-slate-900/70 p-4"
      data-testid="planning-apply-preview"
      role="dialog"
      aria-label={t(
        'planningApplyPreview.title',
        'Review changes before applying',
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-100">
          {t(
            'planningApplyPreview.title',
            'Review changes before applying',
          )}
        </h3>
        <span className="text-xs text-slate-400">
          {t(
            'planningApplyPreview.gameSelectedCount',
            '{{checked}} of {{total}} games selected',
            { checked: checkedCount, total: visibleDiffs.length },
          )}
        </span>
      </header>

      {visibleDiffs.length === 0 ? (
        <p
          className="text-sm text-slate-300 py-2"
          data-testid="planning-apply-preview-empty"
        >
          {t(
            'planningApplyPreview.noChanges',
            'No changes to apply — every selected game already matches the plan.',
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {visibleDiffs.map((d) => {
            const isChecked = checked.has(d.gameId);
            const count = countDiffChanges(d);
            return (
              <li
                key={d.gameId}
                className={
                  isChecked
                    ? 'rounded-md border border-slate-600 bg-slate-800/60 p-3'
                    : 'rounded-md border border-slate-700 bg-slate-800/30 p-3 opacity-60'
                }
                data-testid={`planning-apply-preview-card-${d.gameId}`}
              >
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleGame(d.gameId)}
                    disabled={isApplying}
                    className="mt-1 h-4 w-4"
                    data-testid={`planning-apply-preview-toggle-${d.gameId}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-100 truncate">
                        {gameLabel(d.gameId)}
                      </span>
                      <span className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                        {t(
                          'planningApplyPreview.changeCount',
                          '{{count}} changes',
                          { count },
                        )}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-slate-300">
                      {d.lineupAdded.map((c) => (
                        <li key={`add-${c.playerId}-${c.role}`}>
                          + {renderLineupAdded(c)}
                        </li>
                      ))}
                      {d.lineupRemoved.map((c) => (
                        <li key={`rem-${c.playerId}-${c.role ?? 'off'}`}>
                          − {renderLineupRemoved(c)}
                        </li>
                      ))}
                      {d.lineupMoved.map((c) => (
                        <li key={`mv-${c.playerId}-${c.toRole}`}>
                          → {renderLineupMoved(c)}
                        </li>
                      ))}
                      {d.subsAdded.map((s) => (
                        <li key={`sa-${s.id}`}>+ {renderSubAdded(s)}</li>
                      ))}
                      {d.subsRemoved.map((s) => (
                        <li key={`sr-${s.id}`}>− {renderSubRemoved(s)}</li>
                      ))}
                      {d.subsModified.map((m) => (
                        <li key={`sm-${m.before.id}`}>
                          ✎ {renderSubModified(m)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-start gap-2 rounded-md bg-amber-900/20 border border-amber-700/30 p-2 text-xs text-amber-100">
        <HiOutlineExclamationTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <p>
          {t(
            'planningApplyPreview.applyHint',
            'Unchecking a game skips its update. The plan you saved is not changed by Apply.',
          )}
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isApplying}
          className="rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-600 disabled:opacity-60"
          data-testid="planning-apply-preview-cancel"
        >
          {t('common.cancel', 'Cancel')}
        </button>
        <button
          type="button"
          onClick={() => onConfirm([...checked])}
          disabled={isApplying || checkedCount === 0}
          className="rounded-md bg-amber-500/90 px-4 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="planning-apply-preview-confirm"
        >
          {isApplying
            ? t('planningEditor.applying', 'Applying…')
            : t(
                'planningApplyPreview.confirm',
                'Apply to {{count}} games',
                { count: checkedCount },
              )}
        </button>
      </div>
    </div>
  );
};

export default PlanningApplyPreview;
