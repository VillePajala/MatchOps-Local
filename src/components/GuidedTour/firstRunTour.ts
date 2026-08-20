import type { TourStep } from './tourTypes';

/**
 * Id for the post-signup first-run tour. Used to key the per-user completion
 * flag (`matchops_tour_completed_first-run_<userId>`), so finishing or skipping
 * it once means it never re-triggers for that account.
 */
export const FIRST_RUN_TOUR_ID = 'first-run';

/**
 * The post-signup coached tour. Home half (add players -> create team ->
 * create game) plus welcome/done bookends. Each action step spotlights the
 * inner control when its modal is open, else the Start Screen entry that opens
 * it (multi-selector, first present wins), and auto-advances when the matching
 * app-state signal flips - or the user can tap Next / Skip at any time.
 *
 * PR3 inserts the match-half steps (start timer -> log a goal) between
 * `create-game` and `done`.
 */
export const firstRunTourSteps: TourStep[] = [
  {
    id: 'welcome',
    titleKey: 'guidedTour.welcome.title',
    title: 'Welcome to MatchOps',
    bodyKey: 'guidedTour.welcome.body',
    body: "Let's get you to your first game - it takes about a minute.",
  },
  {
    id: 'add-players',
    titleKey: 'guidedTour.addPlayers.title',
    title: 'Add your players',
    bodyKey: 'guidedTour.addPlayers.body',
    body: 'Open the Club tab, tap Players, and add your squad.',
    targetSelector: ['[data-testid="tour-add-player"]', '[data-testid="tour-players"]'],
    advanceWhen: (s) => s.hasPlayers,
  },
  {
    id: 'create-team',
    titleKey: 'guidedTour.createTeam.title',
    title: 'Create your team',
    bodyKey: 'guidedTour.createTeam.body',
    body: 'In the Club tab, tap Teams to create your team and add your players to it.',
    targetSelector: ['[data-testid="tour-add-team"]', '[data-testid="tour-teams"]'],
    advanceWhen: (s) => s.hasTeam,
  },
  {
    id: 'create-game',
    titleKey: 'guidedTour.createGame.title',
    title: 'Start your first game',
    bodyKey: 'guidedTour.createGame.body',
    body: 'Tap New Game, then choose your team. Playing in a league or tournament? You can add it here or later.',
    targetSelector: ['#teamSelectTop', '[data-testid="tour-new-game"]'],
    // Advance once a game is created and entered (the match view is showing) - we
    // don't trap the coach if they choose not to link a team; it's re-linkable later.
    advanceWhen: (s) => s.screen === 'home',
  },
  {
    id: 'done',
    titleKey: 'guidedTour.done.title',
    title: "You're all set",
    bodyKey: 'guidedTour.done.body',
    body: 'That is the basics. Everything you do saves automatically.',
  },
];
