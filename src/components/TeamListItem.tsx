'use client';

import React, { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HiOutlineEllipsisVertical, HiOutlinePencil, HiOutlineTrash, HiOutlineDocumentDuplicate, HiOutlineUserGroup } from 'react-icons/hi2';
import { Team } from '@/types';
import { useDropdownPosition } from '@/hooks/useDropdownPosition';

interface TeamListItemProps {
  team: Team;
  isEditing: boolean;
  editTeamName: string;
  editTeamColor: string;
  showActionsMenu: boolean;
  deleteTeamGamesCount: number;
  isDeleting: boolean;
  onEditClick: () => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onEditNameChange: (name: string) => void;
  onEditColorChange: (color: string) => void;
  onActionsMenuToggle: () => void;
  onDeleteClick: () => void;
  onDuplicateClick: () => void;
  onManageRosterClick: () => void;
  actionsMenuRef: React.RefObject<HTMLDivElement>;
}

const TeamListItem: React.FC<TeamListItemProps> = memo(({
  team,
  isEditing,
  editTeamName,
  editTeamColor,
  showActionsMenu,
  deleteTeamGamesCount,
  isDeleting,
  onEditClick,
  onEditSave,
  onEditCancel,
  onEditNameChange,
  onEditColorChange,
  onActionsMenuToggle,
  onDeleteClick,
  onDuplicateClick,
  onManageRosterClick,
  actionsMenuRef,
}) => {
  const { t } = useTranslation();
  const [openUpward, setOpenUpward] = useState(false);
  const { calculatePosition } = useDropdownPosition();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isEditing) {
      onEditSave();
    } else if (e.key === 'Escape' && isEditing) {
      onEditCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center justify-between p-3 bg-slate-700/75 border border-indigo-500 rounded-lg">
        <div className="flex items-center gap-3 flex-1">
          <div
            className="w-4 h-4 rounded border-2 border-slate-400 flex-shrink-0"
            style={{ backgroundColor: editTeamColor }}
          />
          <input
            type="text"
            value={editTeamName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-slate-600 text-slate-200 px-2 py-1 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder={t('teamManager.teamNamePlaceholder', 'Team name')}
            autoFocus
          />
          <input
            type="color"
            value={editTeamColor}
            onChange={(e) => onEditColorChange(e.target.value)}
            className="w-8 h-8 rounded border border-slate-500 cursor-pointer"
            title={t('teamManager.selectColor', 'Select color')}
          />
        </div>
        <div className="flex gap-1 ml-2">
          <button
            onClick={onEditSave}
            className="p-1 text-green-400 hover:text-green-300 hover:bg-slate-600 rounded transition-colors"
            title={t('common.save', 'Save')}
          >
            <HiOutlinePencil className="w-4 h-4" />
          </button>
          <button
            onClick={onEditCancel}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-600 rounded transition-colors"
            title={t('common.cancel', 'Cancel')}
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60 rounded-lg transition-all group">
      <div className="flex items-center gap-3">
        <div
          className="w-4 h-4 rounded border-2 border-slate-400 flex-shrink-0"
          style={{ backgroundColor: team.color || '#6366F1' }}
        />
        <div>
          <h3 className="text-slate-200 font-medium">{team.name}</h3>
          <p className="text-xs text-slate-400">
            {t('teamManager.createdAt', 'Created {{date}}', {
              date: new Date(team.createdAt).toLocaleDateString()
            })}
          </p>
        </div>
      </div>

      <div className="relative" ref={actionsMenuRef}>
        <button
          onClick={(e) => {
            setOpenUpward(calculatePosition(e.currentTarget));
            onActionsMenuToggle();
          }}
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-md transition-colors opacity-0 group-hover:opacity-100"
          aria-label={t('teamManager.teamActions', 'Team actions')}
        >
          <HiOutlineEllipsisVertical className="w-4 h-4" />
        </button>

        {showActionsMenu && (
          <div className={`absolute right-0 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-10 min-w-[180px] ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
            <button
              onClick={onManageRosterClick}
              className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-600 flex items-center gap-2 transition-colors"
            >
              <HiOutlineUserGroup className="w-4 h-4" />
              {t('teamManager.manageRoster', 'Manage Roster')}
            </button>
            
            <button
              onClick={onEditClick}
              className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-600 flex items-center gap-2 transition-colors"
            >
              <HiOutlinePencil className="w-4 h-4" />
              {t('teamManager.edit', 'Edit')}
            </button>
            
            <button
              onClick={onDuplicateClick}
              className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-600 flex items-center gap-2 transition-colors"
            >
              <HiOutlineDocumentDuplicate className="w-4 h-4" />
              {t('teamManager.duplicate', 'Duplicate')}
            </button>
            
            <div className="border-t border-slate-600">
              <button
                onClick={onDeleteClick}
                disabled={isDeleting}
                className="w-full px-3 py-2 text-left text-red-400 hover:bg-red-900/20 flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <HiOutlineTrash className="w-4 h-4" />
                {isDeleting 
                  ? t('teamManager.deleting', 'Deleting...') 
                  : deleteTeamGamesCount > 0
                    ? t('teamManager.deleteWithGames', 'Delete ({{count}} games)', { count: deleteTeamGamesCount })
                    : t('teamManager.delete', 'Delete')
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

TeamListItem.displayName = 'TeamListItem';

export default TeamListItem;