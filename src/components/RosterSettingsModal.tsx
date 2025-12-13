'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  ModalFooter,
  primaryButtonStyle,
  secondaryButtonStyle,
  titleStyle,
  cardStyle,
  iconButtonBaseStyle,
  modalContainerStyle
} from '@/styles/modalStyles';
import type { Player } from '@/types'; // Import Player type from the central types file
import {
    HiOutlineTrash,
    HiOutlineChartBar,
    HiOutlineEllipsisVertical
} from 'react-icons/hi2';
import { useTranslation } from 'react-i18next';
import ConfirmationModal from './ConfirmationModal';
import PlayerDetailsModal from './PlayerDetailsModal';
import { useResourceLimit } from '@/hooks/usePremium';

interface RosterSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  availablePlayers: Player[];
  /**
   * @deprecated Use onUpdatePlayer instead. Will be removed in a future version.
   * This prop is no longer used internally.
   */
  onRenamePlayer: (playerId: string, playerData: { name: string; nickname: string }) => void;
  /**
   * @deprecated Use onUpdatePlayer instead. Will be removed in a future version.
   * This prop is no longer used internally.
   */
  onSetJerseyNumber: (playerId: string, number: string) => void;
  /**
   * @deprecated Use onUpdatePlayer instead. Will be removed in a future version.
   * This prop is no longer used internally.
   */
  onSetPlayerNotes: (playerId: string, notes: string) => void;
  onUpdatePlayer?: (playerId: string, updates: Partial<Omit<Player, 'id'>>) => Promise<void>;
  onRemovePlayer: (playerId: string) => void;
  onAddPlayer: (playerData: { name: string; jerseyNumber: string; notes: string; nickname: string }) => void;
  isRosterUpdating?: boolean;
  rosterError?: string | null;
  onOpenPlayerStats: (playerId: string) => void;
}

const RosterSettingsModal: React.FC<RosterSettingsModalProps> = ({
  isOpen,
  onClose,
  onUpdatePlayer,
  availablePlayers,
  onRenamePlayer, // Legacy - kept for backward compatibility
  onSetJerseyNumber, // Legacy - kept for backward compatibility
  onSetPlayerNotes, // Legacy - kept for backward compatibility
  onRemovePlayer,
  onAddPlayer,
  isRosterUpdating,
  rosterError,
  onOpenPlayerStats,
}) => {
  const { t } = useTranslation();
  // Legacy props kept for backward compatibility
  void onRenamePlayer;
  void onSetJerseyNumber;
  void onSetPlayerNotes;

  // Premium limit check for player creation
  const { checkAndPrompt: checkPlayerLimitAndPrompt } = useResourceLimit('player', availablePlayers.length);

  const [createPlayerModalOpen, setCreatePlayerModalOpen] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const [searchText, setSearchText] = useState('');

  // State for the actions menu
  const [actionsMenuPlayerId, setActionsMenuPlayerId] = useState<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null); // Ref for click outside

  // Confirmation modal state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<{ id: string; name: string } | null>(null);

  // Close editing mode when modal closes
  React.useLayoutEffect(() => {
    if (!isOpen) {
      setCreatePlayerModalOpen(false);
      setSelectedPlayerId(null);
    }
  }, [isOpen]);

  // Effect to close actions menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setActionsMenuPlayerId(null); // Close menu if click is outside
      }
    };

    if (actionsMenuPlayerId) { // Only add listener when a menu is open
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    // Cleanup listener on component unmount or when menu closes
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [actionsMenuPlayerId]); // Re-run when the open menu changes

  const handleEditPlayer = (playerId: string) => {
    setSelectedPlayerId(playerId);
    setActionsMenuPlayerId(null);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
  };

  const handleDeleteConfirmed = () => {
    if (playerToDelete) {
      onRemovePlayer(playerToDelete.id);
    }
    setShowDeleteConfirm(false);
    setPlayerToDelete(null);
  };

  const handleAddPlayer = () => {
    // Check premium limit before allowing player creation
    if (!checkPlayerLimitAndPrompt()) {
      return; // Upgrade prompt shown, don't open create modal
    }
    setCreatePlayerModalOpen(true);
  };

  if (!isOpen) return null;

  const filteredPlayers = [...availablePlayers].filter(p => {
    if (!searchText) return true;
    const search = searchText.toLowerCase();
    return (
      p.name.toLowerCase().includes(search) ||
      (p.nickname && p.nickname.toLowerCase().includes(search))
    );
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
      <div className={`${modalContainerStyle} bg-noise-texture relative overflow-hidden h-full w-full flex flex-col`}>
        {/* Background effects */}
        <div className="absolute inset-0 bg-indigo-600/10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-sky-400/10 via-transparent to-transparent" />
        <div className="absolute -inset-[50px] bg-sky-400/5 blur-2xl top-0 opacity-50" />
        <div className="absolute -inset-[50px] bg-indigo-600/5 blur-2xl bottom-0 opacity-50" />

        {/* Content wrapper */}
        <div className="relative z-10 flex flex-col min-h-0 flex-1">
          {/* Header */}
          <div className="flex flex-col">
            {/* Title Section */}
            <div className="flex justify-center items-center pt-10 pb-4 backdrop-blur-sm bg-slate-900/20">
              <h2 className={`${titleStyle} drop-shadow-lg`}>{t('rosterSettingsModal.title', 'Manage Roster')}</h2>
            </div>

            {/* Fixed Section (Stats, Add Button, Team Name) */}
            <div className="px-6 pt-1 pb-4 backdrop-blur-sm bg-slate-900/20">
              {/* Player Counter Section - Always visible */}
              <div className="mb-5 text-center text-sm">
                <div className="flex justify-center items-center text-slate-300">
                  <span>
                    <span className="text-yellow-400 font-semibold">{availablePlayers.length}</span>
                    {" "}{t('rosterSettingsModal.totalPlayersShort', 'Total Players')}
                  </span>
                </div>
              </div>

              {/* Add Player Button - Always visible */}
              <button
                onClick={handleAddPlayer}
                className={`${primaryButtonStyle} w-full bg-indigo-600 hover:bg-indigo-700`}
                disabled={isRosterUpdating}
              >
                {t('rosterSettingsModal.addPlayerButton', 'Add Player')}
              </button>


            </div>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 pt-4 pb-6">
            <input
              type="text"
              placeholder={t('rosterSettingsModal.searchPlaceholder', 'Search players...')}
              value={searchText}
              onChange={handleSearchChange}
              autoComplete="off"
              className="w-full px-3 py-1 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />

            {/* Player List */}
            <div className={`${cardStyle} mt-4 -mx-2 sm:-mx-4 md:-mx-6`}>
              <div className="space-y-3">
                {filteredPlayers.map((player) => (
                  <div
                    key={player.id}
                    className="p-4 rounded-lg transition-all bg-gradient-to-br from-slate-600/50 to-slate-800/30 hover:from-slate-600/60 hover:to-slate-800/40"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-grow flex items-center gap-2 truncate">
                        <span
                          className="text-base text-slate-100 truncate cursor-pointer hover:text-yellow-400"
                          title={player.name}
                          onClick={() => handleEditPlayer(player.id)}
                        >
                          {player.name}{player.nickname ? <span className="text-slate-400"> ({player.nickname})</span> : ''}
                        </span>
                      </div>
                      <div className="relative" ref={actionsMenuPlayerId === player.id ? actionsMenuRef : null}>
                        <button
                          onClick={() => setActionsMenuPlayerId(actionsMenuPlayerId === player.id ? null : player.id)}
                          className={`${iconButtonBaseStyle} text-slate-400 hover:text-slate-200`}
                          title={t('common.actions', 'Actions')}
                          disabled={isRosterUpdating}
                        >
                          <HiOutlineEllipsisVertical className="w-5 h-5" />
                        </button>
                        {actionsMenuPlayerId === player.id && (
                          <div className="absolute right-0 top-8 bg-slate-700 border border-slate-600 rounded-lg shadow-xl z-50 min-w-[140px]">
                            <button
                              onClick={() => {
                                onOpenPlayerStats(player.id);
                                setActionsMenuPlayerId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-600 flex items-center gap-2 first:rounded-t-lg transition-colors"
                            >
                              <HiOutlineChartBar className="w-4 h-4" />
                              {t('common.stats', 'Stats')}
                            </button>
                            <button
                              onClick={() => {
                                setPlayerToDelete({ id: player.id, name: player.name });
                                setShowDeleteConfirm(true);
                                setActionsMenuPlayerId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-600/20 flex items-center gap-2 last:rounded-b-lg transition-colors"
                            >
                              <HiOutlineTrash className="w-4 h-4" />
                              {t('common.delete', 'Delete')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {rosterError && <div className="mt-3 text-sm text-red-400">{rosterError}</div>}
            </div>
          </div>

          {/* Footer */}
          <ModalFooter>
            <button onClick={onClose} className={secondaryButtonStyle}>
              {t('common.doneButton', 'Done')}
            </button>
          </ModalFooter>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title={t('rosterSettingsModal.confirmDeletePlayerTitle', 'Remove Player')}
        message={t('rosterSettingsModal.confirmDeletePlayer', 'Are you sure you want to remove this player?')}
        warningMessage={
          <>
            <strong>{playerToDelete?.name || ''}</strong> will be removed from your roster.
          </>
        }
        onConfirm={handleDeleteConfirmed}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setPlayerToDelete(null);
        }}
        confirmLabel={t('common.remove', 'Remove')}
        variant="danger"
      />

      {/* Player Create Modal */}
      <PlayerDetailsModal
        isOpen={createPlayerModalOpen}
        onClose={() => setCreatePlayerModalOpen(false)}
        mode="create"
        players={availablePlayers}
        onAddPlayer={onAddPlayer}
        isRosterUpdating={isRosterUpdating}
      />

      {/* Player Edit Modal */}
      <PlayerDetailsModal
        isOpen={selectedPlayerId !== null}
        onClose={() => setSelectedPlayerId(null)}
        mode="edit"
        player={availablePlayers.find(p => p.id === selectedPlayerId) || null}
        players={availablePlayers}
        onUpdatePlayer={onUpdatePlayer}
        isRosterUpdating={isRosterUpdating}
      />
    </div>
  );
};

export default RosterSettingsModal;
