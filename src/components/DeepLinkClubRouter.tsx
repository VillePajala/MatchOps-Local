'use client';

/**
 * Routes CLUB-SCOPE PWA-shortcut deep links to the host modals over Home
 * (deep-review fix): before this, every shortcut mounted the whole match
 * view just to float a club modal over it, and closing stranded the user
 * inside whatever game was last current. Match-bound actions (resumeGame,
 * explore) never reach this component - page.tsx switches screens for them.
 */
import { useEffect } from 'react';
import { useModalContext } from '@/contexts/ModalProvider';
import type { AppAction } from '@/hooks/useDeepLinkHandler';

export default function DeepLinkClubRouter({ action, onConsumed }: {
  action: AppAction;
  onConsumed: () => void;
}) {
  const {
    setIsNewGameSetupModalOpen,
    setPlayerIdsForNewGame,
    setIsLoadGameModalOpen,
    setIsRosterModalOpen,
    setIsTeamManagerOpen,
    setIsPersonnelManagerOpen,
    setIsSeasonTournamentModalOpen,
    setCompetitionManagerKind,
    setIsSettingsModalOpen,
    setIsTrainingResourcesOpen,
    setIsRulesDirectoryOpen,
    openSettingsToTab,
    openClubStatsToTab,
  } = useModalContext();

  useEffect(() => {
    switch (action) {
      case 'newGame':
        setPlayerIdsForNewGame(null);
        setIsNewGameSetupModalOpen(true);
        break;
      case 'loadGame':
        setIsLoadGameModalOpen(true);
        break;
      case 'stats':
        // The "Pelaajatilastot" shortcut: club-level player stats.
        openClubStatsToTab('player');
        break;
      case 'roster':
        setIsRosterModalOpen(true);
        break;
      case 'teams':
        setIsTeamManagerOpen(true);
        break;
      case 'personnel':
        setIsPersonnelManagerOpen(true);
        break;
      case 'season':
        // Pin the kind so the manager opens on Seasons, not whatever kind was
        // last left in module state (matches the StartScreen bridge).
        setCompetitionManagerKind('season');
        setIsSeasonTournamentModalOpen(true);
        break;
      case 'settings':
        setIsSettingsModalOpen(true);
        break;
      case 'backup':
        openSettingsToTab('data');
        break;
      case 'account':
        openSettingsToTab('account');
        break;
      case 'training':
        setIsTrainingResourcesOpen(true);
        break;
      case 'rules':
        setIsRulesDirectoryOpen(true);
        break;
      default:
        break;
    }
    onConsumed();
    // All setters are provider-stable; action/onConsumed are stable for the
    // component's lifetime (page unmounts it after consumption).
  }, [action, onConsumed, setIsNewGameSetupModalOpen, setPlayerIdsForNewGame,
      setIsLoadGameModalOpen, setIsRosterModalOpen, setIsTeamManagerOpen,
      setIsPersonnelManagerOpen, setIsSeasonTournamentModalOpen,
      setCompetitionManagerKind,
      setIsSettingsModalOpen, setIsTrainingResourcesOpen,
      setIsRulesDirectoryOpen, openSettingsToTab, openClubStatsToTab]);

  return null;
}
