'use client';

/**
 * AttendanceSheet - "Ketkä ovat paikalla?" (Onboarding v3, step 7).
 *
 * One bottom sheet for every coach and both layouts: the game's players as
 * ticked name chips, "{{present}} / {{total}}", tap the absent ones. Opened
 * from Home's next-game card ("Aloita ottelu" on game day -> mode 'start',
 * "Merkitse poissaolijat" otherwise -> mode 'save') and from the match menu
 * before kick-off (mode 'save'). What saving does lives in services/attendance.
 *
 * When the coach had moved discs by hand since the plan was applied, a change
 * here redoes the line-up, so the sheet says so before the save button does it
 * (the save button is the confirm, "Peruuta" the cancel).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import { useModalHardwareBack } from '@/hooks/useModalHardwareBack';
import {
  attendanceChanged,
  loadAttendance,
  saveAttendance,
  type AttendanceContext,
  type AttendanceDeps,
} from '@/services/attendance';
import { getGame, saveGame } from '@/utils/savedGames';
import { getPlanLink } from '@/utils/playtimePlanner/planLinks';
import { getPlan, savePlan } from '@/utils/playtimePlanner/storage';
import { setGameSubs } from '@/utils/playtimePlanner/gameSubs';
import { getMasterRoster } from '@/utils/masterRosterManager';
import logger from '@/utils/logger';
import {
  Z_LAYER,
  dialogTitleStyle,
  subtextStyle,
  chipStyle,
  chipSelectedStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '@/styles/modalStyles';

export interface AttendanceSheetProps {
  gameId: string;
  /** 'start': the button reads "Aloita" and `onStart` opens the game after saving. */
  mode: 'save' | 'start';
  userId: string | undefined;
  onClose: () => void;
  /** After a save that changed the game (refresh Home, or the live match). */
  onSaved?: (gameId: string) => void;
  /** Mode 'start': open the game. Also offered when the game already kicked off. */
  onStart?: () => void;
  /** Injected in tests; the real storage otherwise. */
  deps?: AttendanceDeps;
}

const AttendanceSheet: React.FC<AttendanceSheetProps> = ({
  gameId,
  mode,
  userId,
  onClose,
  onSaved,
  onStart,
  deps: injectedDeps,
}) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  useModalHardwareBack(true, onClose);

  const deps = useMemo<AttendanceDeps>(
    () =>
      injectedDeps ?? {
        getGame: (id) => getGame(id, userId),
        saveGame: (id, g) => saveGame(id, g, userId),
        getPlanLink,
        getPlan,
        savePlan,
        getMasterRoster: () => getMasterRoster(userId),
        setGameSubs,
      },
    [injectedDeps, userId],
  );

  const [ctx, setCtx] = useState<AttendanceContext | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await loadAttendance(deps, gameId);
        if (cancelled) return;
        if (!loaded) {
          setLoadFailed(true);
          return;
        }
        setCtx(loaded);
        setPresent(new Set(loaded.presentIds));
      } catch (error) {
        logger.error('[AttendanceSheet] load failed:', error);
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deps, gameId]);

  const toggle = useCallback((id: string) => {
    setPresent((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const presentIds = useMemo(() => (ctx ? ctx.players.map((p) => p.id).filter((id) => present.has(id)) : []), [ctx, present]);
  const changed = !!ctx && attendanceChanged(ctx, presentIds);
  const showRedoWarning = ctx?.kind === 'plan' && ctx.handEdited && changed;

  const handleSave = useCallback(async () => {
    if (!ctx || savingRef.current) return;
    if (ctx.kind === 'started') {
      onClose();
      if (mode === 'start') onStart?.();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await saveAttendance(deps, ctx, presentIds);
      if (!result.ok) {
        showToast(
          result.reason === 'started'
            ? t('attendance.alreadyStarted', 'The match has already started, so absences can no longer be marked.')
            : t('attendance.saveError', 'Could not save who is here. Please try again.'),
          'error',
        );
        return;
      }
      if (result.changed) onSaved?.(gameId);
      onClose();
      if (mode === 'start') onStart?.();
    } catch (error) {
      logger.error('[AttendanceSheet] save failed:', error);
      showToast(t('attendance.saveError', 'Could not save who is here. Please try again.'), 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [ctx, deps, presentIds, mode, onClose, onSaved, onStart, showToast, t, gameId]);

  const title = t('attendance.title', 'Who is here?');
  const total = ctx?.players.length ?? 0;

  return (
    <div
      className={`fixed inset-0 ${Z_LAYER.modalNested} flex items-end justify-center bg-black/60`}
      onClick={onClose}
      data-testid="attendance-sheet-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="attendance-sheet"
        className="w-full max-w-md s1-sheet rounded-t-[26px] px-4 pt-3 pb-[max(24px,env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto font-ui text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" aria-hidden="true" />
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h2 className={dialogTitleStyle}>{title}</h2>
          {ctx && (
            <span className="text-base font-semibold tabular-nums text-ink-2" data-testid="attendance-count">
              {t('attendance.count', '{{present}} / {{total}}', { present: presentIds.length, total })}
            </span>
          )}
        </div>

        {loadFailed ? (
          <p className={`${subtextStyle} px-1 mt-3`}>{t('attendance.loadError', 'The game could not be opened.')}</p>
        ) : !ctx ? (
          <p className={`${subtextStyle} px-1 mt-3`} role="status">{t('common.loading', 'Loading...')}</p>
        ) : ctx.kind === 'started' ? (
          <p className="px-1 mt-3 text-[15px] leading-snug text-ink-2" data-testid="attendance-started">
            {t('attendance.alreadyStarted', 'The match has already started, so absences can no longer be marked.')}
          </p>
        ) : (
          <>
            <p className={`${subtextStyle} px-1 mt-1`}>{t('attendance.tapAbsent', 'Tap the players who are away')}</p>
            {showRedoWarning && (
              <p
                role="alert"
                data-testid="attendance-redo-warning"
                className="mt-3 rounded-2xl bg-action/10 px-3.5 py-2.5 text-[14px] leading-snug text-ink ring-1 ring-inset ring-action/30"
              >
                {t('attendance.redoWarning', 'The line-up will be made again from the plan. Changes made by hand on the pitch are replaced.')}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2" data-testid="attendance-chips">
              {ctx.players.map((p) => {
                const here = present.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    aria-pressed={here}
                    className={`${here ? chipSelectedStyle : `${chipStyle} line-through decoration-ink-3`} min-h-11`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-6 flex gap-2.5">
          <button type="button" onClick={onClose} className={`${secondaryButtonStyle} flex-1 min-h-12`}>
            {t('common.cancel', 'Cancel')}
          </button>
          {!loadFailed && !(ctx?.kind === 'started' && mode === 'save') && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!ctx || saving}
              data-testid="attendance-save"
              className={`${primaryButtonStyle} flex-1 min-h-12`}
            >
              {ctx?.kind === 'started'
                ? t('attendance.openGame', 'Open the match')
                : mode === 'start'
                  ? t('attendance.start', 'Start')
                  : t('attendance.save', 'Save')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendanceSheet;
