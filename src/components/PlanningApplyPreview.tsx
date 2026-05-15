'use client';

import React, { useCallback, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HiOutlineExclamationTriangle,
  HiOutlineInformationCircle,
} from 'react-icons/hi2';
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
  /**
   * Game ids the parent couldn't load from savedGames (cloud sync race,
   * IndexedDB eviction). Surfaced inline so the user knows they'll be
   * skipped; the parent re-includes them on confirm so the post-apply
   * warning still fires.
   */
  missingGameIds?: string[];
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
  missingGameIds = [],
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
  // useState only consumes the initializer on mount. Safe here because
  // the parent (PlanningEditor) always toggles previewDiffs null →
  // array → null, which unmounts and remounts this component for each
  // open. If a future caller passes updated diffs to a still-mounted
  // instance, derive checked from props instead.
  const [checked, setChecked] = useState<Set<string>>(initialChecked);

  // Memoised so the per-game row callbacks don't reattach on every
  // parent re-render (the diffs/savedGames/roster props can churn while
  // the user reads the preview, and the row checkboxes shouldn't
  // re-render for that). setChecked is stable so `[]` deps are correct.
  const toggleGame = useCallback((gameId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  }, []);

  const visibleDiffs = diffs.filter((d) => !d.isEmpty);
  // Derive from visibleDiffs rather than checked.size so the header
  // count can't drift if a future caller pre-checks ids that aren't
  // in the visible set.
  const checkedCount = visibleDiffs.filter((d) => checked.has(d.gameId)).length;
  const titleId = useId();

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
          'planningApplyPreview.lineupRemovedNoRole',
          'Remove {{player}} (off-formation)',
          { player: playerLabel(c.playerId) },
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

  // outPlayer is omitted from the draft side at the type level
  // (DraftScheduledSub doesn't compute who comes off — the swap engine
  // does that lazily at apply time), so subAdded can't surface it.
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
    s.outPlayer
      ? t(
          'planningApplyPreview.subRemovedWithOut',
          'Cancel sub at {{time}}: {{player}} on for {{outPlayer}} at {{role}}',
          {
            time: formatTime(s.timeSeconds),
            player: playerLabel(s.inPlayer),
            outPlayer: playerLabel(s.outPlayer),
            role: s.positionRole,
          },
        )
      : t(
          'planningApplyPreview.subRemoved',
          'Cancel sub at {{time}}: {{player}} on at {{role}}',
          {
            time: formatTime(s.timeSeconds),
            player: playerLabel(s.inPlayer),
            role: s.positionRole,
          },
        );

  // beforeStr / afterStr below are plain strings (no HTML, no
  // unresolved {{tokens}}), so embedding them via i18next interpolation
  // into subModified is safe — i18next escapes plain strings.
  const renderSubModified = (m: SubModifyChange): string => {
    const beforeStr = m.before.outPlayer
      ? t(
          'planningApplyPreview.subRefWithOut',
          '{{time}} {{player}}↔{{outPlayer}} {{role}}',
          {
            time: formatTime(m.before.timeSeconds),
            player: playerLabel(m.before.inPlayer),
            outPlayer: playerLabel(m.before.outPlayer),
            role: m.before.positionRole,
          },
        )
      : t(
          'planningApplyPreview.subRef',
          '{{time}} {{player}} {{role}}',
          {
            time: formatTime(m.before.timeSeconds),
            player: playerLabel(m.before.inPlayer),
            role: m.before.positionRole,
          },
        );
    const afterStr = t(
      'planningApplyPreview.subRef',
      '{{time}} {{player}} {{role}}',
      {
        time: formatTime(m.after.timeSeconds),
        player: playerLabel(m.after.inPlayer),
        role: m.after.positionRole,
      },
    );
    return t(
      'planningApplyPreview.subModified',
      'Update sub: {{before}} → {{after}}',
      { before: beforeStr, after: afterStr },
    );
  };

  const gameLabel = (gameId: string): string => {
    const game: AppState | undefined = savedGames[gameId];
    if (!game) {
      return t('planningApplyPreview.gameMissing', 'Game ({{id}})', {
        id: gameId,
      });
    }
    const opp = game.opponentName || '';
    // Guard against malformed gameDate strings (e.g. legacy migration
    // edge cases) so we don't render the literal "Invalid Date".
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

  return (
    <div
      className="space-y-3 rounded-md border border-slate-700 bg-slate-900/70 p-4"
      data-testid="planning-apply-preview"
      role="region"
      aria-labelledby={titleId}
    >
      <header className="flex items-center justify-between gap-3">
        <h3 id={titleId} className="text-base font-semibold text-slate-100">
          {t(
            'planningApplyPreview.title',
            'Review changes before applying',
          )}
        </h3>
        {/* Live region scoped to the dynamic count text — wider scope
            would announce every checkbox toggle and card reflow.
            Note: gameSelectedCount_one hardcodes "1" rather than
            interpolating {{count}}, so when count===1 the param is
            unused; the i18next plural rule still selects on it. */}
        <span className="text-xs text-slate-400" aria-live="polite">
          {t(
            'planningApplyPreview.gameSelectedCount',
            '{{checked}} of {{count}} games selected',
            {
              checked: checkedCount,
              count: visibleDiffs.length,
            },
          )}
        </span>
      </header>

      {missingGameIds.length > 0 && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md bg-rose-900/20 border border-rose-700/40 p-2 text-xs text-rose-100"
          data-testid="planning-apply-preview-missing"
        >
          <HiOutlineExclamationTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <p>
            {t(
              'planningApplyPreview.missingGames',
              "{{count}} game can't be loaded and will be skipped.",
              { count: missingGameIds.length },
            )}
          </p>
        </div>
      )}

      {/* "No changes to apply" only makes sense when nothing is being
          skipped either — otherwise it contradicts the missing notice
          ("nothing to apply" while also "2 games can't be loaded"). */}
      {visibleDiffs.length === 0 && missingGameIds.length === 0 ? (
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
                      {/* The +/-/→/✎ glyphs are decorative — the
                          surrounding copy ("Add …", "Remove …") already
                          states the change type, so screen readers
                          should skip them. */}
                      {d.lineupAdded.map((c) => (
                        <li key={`add-${c.playerId}-${c.role}`}>
                          <span aria-hidden="true">+ </span>
                          {renderLineupAdded(c)}
                        </li>
                      ))}
                      {d.lineupRemoved.map((c) => (
                        <li key={`rem-${c.playerId}-${c.role ?? 'off'}`}>
                          <span aria-hidden="true">− </span>
                          {renderLineupRemoved(c)}
                        </li>
                      ))}
                      {d.lineupMoved.map((c) => (
                        <li key={`mv-${c.playerId}-${c.toRole}`}>
                          <span aria-hidden="true">→ </span>
                          {renderLineupMoved(c)}
                        </li>
                      ))}
                      {d.subsAdded.map((s) => (
                        <li key={`sa-${s.id}`}>
                          <span aria-hidden="true">+ </span>
                          {renderSubAdded(s)}
                        </li>
                      ))}
                      {d.subsRemoved.map((s) => (
                        <li key={`sr-${s.id}`}>
                          <span aria-hidden="true">− </span>
                          {renderSubRemoved(s)}
                        </li>
                      ))}
                      {d.subsModified.map((m) => (
                        <li key={`sm-${m.before.id}`}>
                          <span aria-hidden="true">✎ </span>
                          {renderSubModified(m)}
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

      {/* Hint only makes sense when there are cards to uncheck.
          Slate styling (informational) — amber would imply a warning,
          but this copy is purely instructional. The rose missing-games
          notice above is the one that warrants warning color. */}
      {visibleDiffs.length > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-slate-700/40 border border-slate-600/40 p-2 text-xs text-slate-300">
          <HiOutlineInformationCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <p>
            {t(
              'planningApplyPreview.applyHint',
              'Unchecking a game skips its update. The plan you saved is not changed by Apply.',
            )}
          </p>
        </div>
      )}

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
          // Derive the payload from visibleDiffs so a future caller
          // that pre-checks ids outside the visible set can't pass
          // along ids the user never saw in the preview.
          onClick={() =>
            onConfirm(
              visibleDiffs
                .filter((d) => checked.has(d.gameId))
                .map((d) => d.gameId),
            )
          }
          // Allow Confirm even with checkedCount === 0 when there are
          // missing games — the parent re-injects them into the apply
          // payload so the existing applyWarnMissing post-apply banner
          // still fires. Pre-PR-8b, handleApply(gameIds) always
          // iterated the full set; this preserves that safety net.
          disabled={
            isApplying ||
            (checkedCount === 0 && missingGameIds.length === 0)
          }
          className="rounded-md bg-amber-500/90 px-4 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="planning-apply-preview-confirm"
        >
          {isApplying
            ? t('planningEditor.applying', 'Applying…')
            : checkedCount === 0 && missingGameIds.length > 0
              ? // All games are missing — Confirm is enabled so the
                // post-apply applyWarnMissing banner can fire, but
                // "Apply to 0 games" would be misleading. Use a
                // neutral "Continue" label instead.
                t('planningApplyPreview.confirmMissingOnly', 'Continue')
              : // FI's confirm_one and confirm_other are intentionally
                // identical — the elative case "{{count}} peliin"
                // covers both singular and plural in this construction.
                t(
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
