'use client';

import React, { useState, useEffect } from 'react';
import { ModalFooter, primaryButtonStyle, secondaryButtonStyle } from '@/styles/modalStyles';
import { useTranslation } from 'react-i18next';
import { Player } from '@/types';
import logger from '@/utils/logger';

interface PlayerDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'edit';
  player?: Player | null;
  players: Player[]; // Available players list (for future enhancements)
  onAddPlayer?: (playerData: { name: string; nickname: string; jerseyNumber: string; notes: string }) => void;
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
  // players is kept for future enhancements (e.g., duplicate validation)
  void players;
  const { t } = useTranslation();

  // Form state
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Initialize form when player changes or modal opens
  useEffect(() => {
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
  }, [mode, player, isOpen]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedNickname = nickname.trim();

    if (!trimmedName) {
      return; // Name is required
    }

    try {
      if (mode === 'create') {
        // Create new player
        if (!onAddPlayer) return;

        onAddPlayer({
          name: trimmedName,
          nickname: trimmedNickname,
          jerseyNumber: jerseyNumber.trim(),
          notes: notes.trim(),
        });
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

  if (!isOpen) {
    return null;
  }

  const isPending = isRosterUpdating;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[70] font-display">
      <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light pointer-events-none" />

        {/* Header */}
        <div className="flex flex-col flex-shrink-0">
          <div className="flex justify-center items-center pt-10 pb-4 px-6 backdrop-blur-sm bg-slate-900/20">
            <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg text-center">
              {mode === 'create'
                ? t('playerDetailsModal.createTitle', 'Add Player')
                : t('playerDetailsModal.editTitle', 'Player Details')}
            </h2>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 p-6">
          <div className="bg-slate-900/70 p-4 rounded-lg border border-slate-700 shadow-inner">
            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('playerDetailsModal.nameLabel', 'Player Name')} *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('playerDetailsModal.namePlaceholder', 'Enter player name')}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
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
                <p className="mt-1 text-xs text-slate-400">
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
                  onChange={(e) => setJerseyNumber(e.target.value)}
                  placeholder={t('playerDetailsModal.jerseyNumberPlaceholder', 'e.g., 10')}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

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
        <ModalFooter>
          <button onClick={handleCancel} className={secondaryButtonStyle}>
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || isPending}
            className={primaryButtonStyle}
          >
            {isPending
              ? t('common.saving', 'Saving...')
              : mode === 'create'
              ? t('common.add', 'Add')
              : t('common.save', 'Save')}
          </button>
        </ModalFooter>
      </div>
    </div>
  );
};

export default PlayerDetailsModal;
