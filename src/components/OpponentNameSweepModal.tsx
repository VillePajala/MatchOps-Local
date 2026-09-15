'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/ToastProvider';
import { CollapsibleModalHeader, ModalContainer } from '@/styles/modalStyles';
import { useOpponentVariantGroups } from '@/hooks/useOpponentVariantGroups';
import { useOpponentRename } from '@/hooks/useOpponentRename';
import logger from '@/utils/logger';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

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
  const { showToast } = useToast();

  /** Chosen spelling per group, keyed by the group's normalised key. */
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState<string | null>(null);
  const [resolved, setResolved] = useState<string[]>([]);

  // Shared with the badge on the competitions manager, so the two can never
  // disagree about whether there is anything to fix.
  const allGroups = useOpponentVariantGroups(isOpen);
  const groups = useMemo(
    () => allGroups.filter((group) => !resolved.includes(group.key)),
    [allGroups, resolved],
  );

  // The writes live in useOpponentRename because the new-game form performs the
  // same rename when a coach refuses an adopted spelling. Two entry points, one
  // code path, so they cannot drift apart.
  const { renameOpponent } = useOpponentRename(isOpen);

  const apply = async (key: string, canonical: string) => {
    setApplying(key);
    try {
      const result = await renameOpponent(key, canonical);
      if (!result) return;
      setResolved((prev) => [...prev, key]);
      // A stale spelling can live on a league's list while no current game uses
      // it, in which case "Renamed in 0 games" is true and useless - the league
      // list was the thing that changed.
      showToast(
        result.gamesChanged > 0
          ? t('opponentSweep.applied', 'Renamed in {{count}} games.', { count: result.gamesChanged })
          : t('opponentSweep.appliedListsOnly', 'Renamed in the competition list.'),
        'success',
      );
    } catch (error) {
      logger.error('[OpponentNameSweepModal] rename failed', error);
      showToast(t('opponentSweep.failed', 'Could not rename. Please try again.'), 'error');
    } finally {
      setApplying(null);
    }
  };

  useEscapeToClose(isOpen, onClose);


  if (!isOpen) return null;

  return (
    // ModalContainer, not a hand-rolled wrapper: it carries the h-full/w-full
    // and the noise texture every other modal in the app has. Rolling my own
    // produced a band of content floating in the middle of a black screen.
    <ModalContainer aria-label={t('opponentSweep.title', 'Check team names')}>
      <CollapsibleModalHeader
            title={t('opponentSweep.title', 'Check team names')}
            onClose={onClose}
            closeLabel={t('common.doneButton', 'Done')}
          >
            <p className="text-sm text-slate-400 px-6 pt-2 pb-3 text-center">
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
                    {/* Stacked, not side by side: "Käytä tätä kaikkialla" is
                        three words that wrapped onto three lines next to the
                        field and dwarfed it. A full-width row is the app's own
                        pattern for a primary action anyway. */}
                    <input
                      type="text"
                      value={chosen}
                      onChange={(e) => setChoices((prev) => ({ ...prev, [group.key]: e.target.value }))}
                      aria-label={t('opponentSweep.canonicalLabel', 'Spelling to keep')}
                      data-testid={`opponent-sweep-input-${group.key}`}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => apply(group.key, chosen)}
                      disabled={busy || !chosen.trim()}
                      data-testid={`opponent-sweep-apply-${group.key}`}
                      className="w-full px-4 py-2.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold whitespace-nowrap disabled:opacity-50 transition-colors"
                    >
                      {busy
                        ? t('opponentSweep.applying', 'Renaming…')
                        : t('opponentSweep.apply', 'Use this everywhere')}
                    </button>
                  </div>
                );
              })
        )}
      </div>
    </ModalContainer>
  );
};

export default OpponentNameSweepModal;
