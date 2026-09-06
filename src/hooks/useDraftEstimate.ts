'use client';

/**
 * What one AI report request would cost, roughly.
 *
 * Shared by the drafting card and by the tidy button that now sits next to the
 * report text, so the two can never quote different numbers for the same job.
 * A button that spends the coach's money says the price on itself, wherever it
 * happens to live.
 *
 * Returns 0 when no provider is connected, which callers read as "nothing to
 * offer here" rather than as "free".
 */

import { useDeferredValue, useMemo } from 'react';
import { buildGamePacket } from '@/utils/gamePacket';
import { estimateDraftUsd } from '@/utils/aiDrafting';
import { useAiProviderState } from '@/utils/aiProvider';
import type { AppState } from '@/types/game';
import type { Player } from '@/types';

export function useDraftEstimate({
  game,
  players,
  language,
  coachReport,
}: {
  game: AppState;
  players: Player[];
  language: string;
  /** The report as it stands on screen, which is what would be sent. */
  coachReport: string;
}): number {
  const ai = useAiProviderState();
  // The report is a textarea buffer while the editor is open, so this changes
  // on every keystroke. Deferring keeps typing responsive; a rough price can
  // catch up a beat later.
  const deferredReport = useDeferredValue(coachReport);

  return useMemo(() => {
    if (!ai.connected) return 0;
    try {
      const { packet } = buildGamePacket({
        game,
        players,
        pseudonymize: ai.pseudonymize,
        language,
        coachReport: deferredReport,
      });
      return estimateDraftUsd(packet);
    } catch {
      return 0;
    }
  }, [ai.connected, ai.pseudonymize, deferredReport, game, players, language]);
}
