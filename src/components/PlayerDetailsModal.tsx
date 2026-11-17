'use client';

import { useHoldUnsavedInput } from '@/utils/unsavedInputSignal';
import React, { useState, useId, useRef } from 'react';
import { CollapsibleModalHeader, ModalStickyPrimary } from '@/styles/modalStyles';
import { useHardwareBackSubLevel } from '@/hooks/useModalHardwareBack';
import { useTranslation } from 'react-i18next';
import { Player } from '@/types';
import logger from '@/utils/logger';
import { MODAL_BACKDROP, Z_LAYER } from '@/styles/modalStyles';
import { useEscapeToClose } from '@/hooks/useEscapeToClose';

interface PlayerDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  player?: Player | null;
  players: Player[]; // Available players list (for future enhancements)
  /** Resolves `false` when the player was not added (the form then stays open). */
  onAddPlayer?: (playerData: { name: string; nickname: string; jerseyNumber: string; notes: string }) => void | boolean | Promise<void | boolean>;
  onUpdatePlayer?: (playerId: string, updates: Partial<Omit<Player, 'id'>>) => Promise<void>;
  isRosterUpdating?: boolean;
}

const PlayerDetailsModal: React.FC<PlayerDetailsModalProps> = ({
  isOpen,
  onClose,
  mode,
  player,
  players, // Reserved for future use
  onAddPlayer,
  onUpdatePlayer,
  isRosterUpdating,
}) => {
  const { t } = useTranslation();
  // An open player form must survive a long switch to another app (review 7.1).
  useHoldUnsavedInput(isOpen);

  // Form state
  useEscapeToClose(isOpen, onClose);
  const modalTitleId = useId();
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  // Review 7.10: a duplicate number or a failed save used to close the form and
  // drop what was typed; the only message was off-screen under the roster list.
  const [numberError, setNumberError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Review 7.11: a double tap on Lisää must not save twice. A ref stops the second
  // tap at once (state commits too late); the state disables the button meanwhile.
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize form when player changes or modal opens
  React.useLayoutEffect(() => {
    if (isOpen) {
      setNameError(null);
      setNumberError(null);
      setSaveError(null);
      if (mode === 'create') {
        // Reset form for create mode
        setName('');
        setNickname('');
        setJerseyNumber('');
        setNotes('');
      } else if (player) {
        // Load existing player data for edit mode
        setName(player.name || '');
        setNickname(player.nickname || '');
        setJerseyNumber(player.jerseyNumber || '');
        setNotes(player.notes || '');
      }
    }
  }, [mode, player, isOpen]);

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      await saveOnce();
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const saveOnce = async () => {
    const trimmedName = name.trim();
    const trimmedNickname = nickname.trim();

    if (!trimmedName) {
      return; // Name is required
    }

    // Check for duplicate name
    const isDuplicate = players.some(p =>
      p.name.toLowerCase() === trimmedName.toLowerCase() &&
      (mode === 'create' || p.id !== player?.id)  // Exclude self in edit mode
    );

    if (isDuplicate) {
      setNameError(t('playerDetailsModal.duplicateNameError', 'A player with this name already exists'));
      return;  // Don't close modal
    }

    // Same rule the roster applies, checked here so the coach sees it at the field.
    const trimmedNumber = jerseyNumber.trim();
    if (mode === 'create' && trimmedNumber) {
      const numberTaken = players.some(p => p.jerseyNumber && p.jerseyNumber.trim() === trimmedNumber);
      if (numberTaken) {
        setNumberError(t('rosterSettingsModal.errors.duplicateNumber', 'A player with this jersey number already exists. Please use a different number or leave it blank.'));
        return;  // Don't close modal
      }
    }
    setSaveError(null);

    try {
      if (mode === 'create') {
        // Create new player
        if (!onAddPlayer) return;

        const added = await onAddPlayer({
          name: trimmedName,
          nickname: trimmedNickname,
          jerseyNumber: trimmedNumber,
          notes: notes.trim(),
        });
        if (added === false) {
          // Not added: keep the form and what was typed.
          setSaveError(t('rosterSettingsModal.errors.addFailed', 'Error adding player {{playerName}}. Please try again.', { playerName: trimmedName }));
          return;
        }
      } else {
        // Update existing player
        if (!player || !onUpdatePlayer) return;

        const updates: Partial<Omit<Player, 'id'>> = {};

        if (trimmedName !== player.name) updates.name = trimmedName;
        if (trimmedNickname !== (player.nickname || '')) updates.nickname = trimmedNickname;
        if (jerseyNumber !== (player.jerseyNumber || '')) updates.jerseyNumber = jerseyNumber;
        if (notes !== (player.notes || '')) updates.notes = notes;

        if (Object.keys(updates).length > 0) {
          await onUpdatePlayer(player.id, updates);
        }
      }

      onClose();
    } catch (error) {
      logger.error('Failed to save player:', error);
      // Error displayed to user via parent component toast
    }
  };

  const handleCancel = () => {
    onClose();
  };

  // Cancel THIS nested dialog on hardware back instead of falling through to the
  // parent roster manager. A PREEMPTIVE sub-guard so back#1 cancels the dialog
  // and back#2 still reaches the manager's sentinel - no fragile
  // re-arm-after-a-back (which fails on Android WebViews and would exit the app).
  useHardwareBackSubLevel(isOpen, handleCancel);

  if (!isOpen) {
    return null;
  }

  const isPending = isRosterUpdating || isSaving;

  return (
    <div className={`${MODAL_BACKDROP} ${Z_LAYER.modalNested}`} role="dialog" aria-modal="true" aria-labelledby={modalTitleId}>
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />

        {/* Chrome slimming: X-header (Cancel) + sticky Save. */}
        <CollapsibleModalHeader
          titleId={modalTitleId}
          title={mode === 'create'
            ? t('playerDetailsModal.createTitle', 'Add Player')
            : t('playerDetailsModal.editTitle', 'Player Details')}
          onClose={handleCancel}
          closeLabel={t('common.cancel', 'Cancel')}
        />

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-4 pb-6">
          <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner -mx-2 sm:-mx-4 md:-mx-6">
            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('playerDetailsModal.nameLabel', 'Player Name')} *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameError(null);
                  }}
                  placeholder={t('playerDetailsModal.namePlaceholder', 'Enter player name')}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
                {nameError && (
                  <p className="mt-1 text-sm text-red-400">{nameError}</p>
                )}
                {saveError && (
                  <p className="mt-1 text-sm text-red-400" role="alert" data-testid="player-save-error">{saveError}</p>
                )}
              </div>

              {/* Nickname */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('playerDetailsModal.nicknameLabel', 'Nickname')}
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder={t('playerDetailsModal.nicknamePlaceholder', 'Optional nickname')}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <p className="mt-1 text-sm text-slate-400">
                  {t('playerDetailsModal.nicknameHint', 'Shown on field if provided')}
                </p>
              </div>

              {/* Jersey Number */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('playerDetailsModal.jerseyNumberLabel', 'Jersey Number')}
                </label>
                <input
                  type="text"
                  value={jerseyNumber}
                  onChange={(e) => {
                    setJerseyNumber(e.target.value);
                    setNumberError(null);
                  }}
                  placeholder={t('playerDetailsModal.jerseyNumberPlaceholder', 'e.g., 10')}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {numberError && (
                <p className="-mt-2 text-sm text-red-400" role="alert" data-testid="player-number-error">{numberError}</p>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('playerDetailsModal.notesLabel', 'Notes')}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('playerDetailsModal.notesPlaceholder', 'Optional notes about this player')}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <ModalStickyPrimary onClick={handleSave} disabled={!name.trim() || isPending} dataTestId="tour-save-player">
          {isPending
            ? t('common.saving', 'Saving...')
            : mode === 'create'
            ? t('common.add', 'Add')
            : t('common.save', 'Save')}
        </ModalStickyPrimary>
      </div>
    </div>
  );
};

export default PlayerDetailsModal;
