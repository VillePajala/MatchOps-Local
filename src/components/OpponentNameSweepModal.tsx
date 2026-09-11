'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/config/queryKeys';
import { useDataStore } from '@/hooks/useDataStore';
import { useToast } from '@/contexts/ToastProvider';
import { CollapsibleModalHeader, modalContainerStyle, ModalBackgroundEffects } from '@/styles/modalStyles';
import { getSeasons, updateSeason } from '@/utils/seasons';
import { getSavedGames, saveGame } from '@/utils/savedGames';
import { groupOpponentVariants } from '@/utils/opponentNames';
import { planOpponentRename, renameInOpponentList } from '@/utils/opponentRename';
import logger from '@/utils/logger';
import type { Season } from '@/types';
import type { SavedGamesCollection } from '@/types/game';

interface OpponentNameSweepModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Find one team written several ways, and settle on one spelling.
 *
 * WHAT IT CAN AND CANNOT KNOW. It groups spellings that are identical after
 * normalising - case, separators, whitespace - and never anything looser. It
 * therefore catches "IPS"/"Ips"/"IPS - Sininen" and deliberately never proposes
 * merging "IPS/Punainen" with "IPS/Sininen", which a similarity score would,
 * because those are two different squads sharing a club name.
 *
 * It also cannot know which spelling is CORRECT, and does not pretend to: no
 * casing rule survives Finnish club names, where PePo and KuPS are correctly
 * mixed case while IPS and HJK are not. It suggests the most-used spelling and
 * the coach overtypes it if they want. Consistency is what the app needs;
 * correctness is the coach's call.
 */
const OpponentNameSweepModal: React.FC<OpponentNameSweepModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { userId } = useDataStore();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: seasons } = useQuery<Season[]>({
    queryKey: [...queryKeys.seasons, userId],
    queryFn: () => getSeasons(userId),
    enabled: isOpen,
  });
  const { data: savedGames } = useQuery<SavedGamesCollection>({
    queryKey: [...queryKeys.savedGames, userId],
    queryFn: () => getSavedGames(userId),
    enabled: isOpen,
  });

  /** Chosen spelling per group, keyed by the group's normalised key. */
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState<string | null>(null);
  const [resolved, setResolved] = useState<string[]>([]);

  const groups = useMemo(() => {
    // Every OCCURRENCE, not a deduplicated list: the repetition is what ranks
    // the suggestion, so a spelling used in nine games outranks one used once.
    const fromGames = Object.values(savedGames ?? {}).map((g) => g?.opponentName ?? '');
    const fromSeasons = (seasons ?? []).flatMap((s) => s.opponents ?? []);
    return groupOpponentVariants([...fromGames, ...fromSeasons])
      .filter((group) => !resolved.includes(group.key));
  }, [savedGames, seasons, resolved]);

  const apply = async (key: string, canonical: string) => {
    const plan = planOpponentRename(key, canonical, savedGames, seasons);
    if (plan.isNoop) return;

    setApplying(key);
    try {
      // Games first: they are the data the statistics read. A competition list
      // left stale is cosmetic and the coach can fix it by hand; a half-renamed
      // set of games is the thing that silently splits an opponent in two.
      for (const gameId of plan.gameIds) {
        const game = savedGames?.[gameId];
        if (!game) continue;
        await saveGame(gameId, { ...game, opponentName: plan.canonical }, userId);
      }

      for (const seasonId of plan.seasonIds) {
        const season = (seasons ?? []).find((s) => s.id === seasonId);
        if (!season) continue;
        await updateSeason(
          { ...season, opponents: renameInOpponentList(season.opponents ?? [], key, plan.canonical) },
          userId,
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.savedGames }),
        queryClient.invalidateQueries({ queryKey: queryKeys.seasons }),
      ]);
      setResolved((prev) => [...prev, key]);
      showToast(
        t('opponentSweep.applied', 'Renamed in {{count}} games.', { count: plan.gameIds.length }),
        'success',
      );
    } catch (error) {
      logger.error('[OpponentNameSweepModal] rename failed', error);
      showToast(t('opponentSweep.failed', 'Could not rename. Please try again.'), 'error');
    } finally {
      setApplying(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className={modalContainerStyle}>
        <ModalBackgroundEffects />
        <div className="relative z-10 flex flex-col min-h-0 h-full">
          <CollapsibleModalHeader
            title={t('opponentSweep.title', 'Check team names')}
            onClose={onClose}
            closeLabel={t('common.doneButton', 'Done')}
          >
            <p className="text-xs text-slate-400 px-6 pt-2 pb-3 text-center">
              {t('opponentSweep.subtitle', 'One team written several ways counts as several opponents in your statistics.')}
            </p>
          </CollapsibleModalHeader>

          <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-4 pb-6 space-y-3">
            {groups.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8" data-testid="opponent-sweep-clean">
                {t('opponentSweep.allClean', 'Every team is written the same way everywhere. Nothing to fix.')}
              </p>
            ) : (
              groups.map((group) => {
                const chosen = choices[group.key] ?? group.suggested;
                const busy = applying === group.key;
                return (
                  <div
                    key={group.key}
                    data-testid={`opponent-sweep-group-${group.key}`}
                    className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 space-y-3"
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {group.variants.map((variant) => (
                        <span
                          key={variant}
                          className="px-2.5 py-1 rounded-full text-xs bg-slate-700/80 border border-slate-600/60 text-slate-200"
                        >
                          {variant}
                          <span className="ml-1.5 text-slate-400">{group.counts[variant]}</span>
                        </span>
                      ))}
                    </div>

                    {/* A TEXT BOX, not a choice between the variants: sometimes
                        every spelling in the data is wrong and the coach needs
                        to type the one they actually want. */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chosen}
                        onChange={(e) => setChoices((prev) => ({ ...prev, [group.key]: e.target.value }))}
                        aria-label={t('opponentSweep.canonicalLabel', 'Spelling to keep')}
                        data-testid={`opponent-sweep-input-${group.key}`}
                        className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => apply(group.key, chosen)}
                        disabled={busy || !chosen.trim()}
                        data-testid={`opponent-sweep-apply-${group.key}`}
                        className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50"
                      >
                        {busy
                          ? t('opponentSweep.applying', 'Renaming…')
                          : t('opponentSweep.apply', 'Use this everywhere')}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpponentNameSweepModal;
