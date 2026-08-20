import type { TourStep } from './tourTypes';

/**
 * Id for the post-signup first-run tour. Used to key the per-user completion
 * flag (`matchops_tour_completed_first-run_<userId>`), so finishing or skipping
 * it once means it never re-triggers for that account.
 */
export const FIRST_RUN_TOUR_ID = 'first-run';

/**
 * The post-signup coached tour: add players -> create team -> create game ->
 * start the clock -> log a goal, with welcome/done bookends. Each action step
 * declares a TAP CHAIN (most specific first): the overlay spotlights the first
 * control currently on screen and shows that stage's hint, so the coach is
 * guided one tap at a time - including the tab switch that gets them there.
 * Action steps auto-advance when the matching app-state signal flips and offer
 * only Skip (the highlighted control is the way forward); the welcome/done
 * bookends advance with Next/Done.
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
    targets: [
      {
        selector: '[data-testid="tour-save-player"]',
        hintKey: 'guidedTour.hints.savePlayer',
        hint: "Type the player's name and save. Add a few, then close the list.",
      },
      {
        selector: '[data-testid="tour-add-player"]',
        hintKey: 'guidedTour.hints.addPlayer',
        hint: 'Tap Add Player.',
      },
      {
        selector: '[data-testid="tour-players"]',
        hintKey: 'guidedTour.hints.tapPlayers',
        hint: 'Tap Players.',
      },
      {
        selector: '[data-testid="tour-tab-club"]',
        hintKey: 'guidedTour.hints.openClubTab',
        hint: 'Open the Club tab.',
      },
    ],
    advanceWhen: (s) => s.hasPlayers,
  },
  {
    id: 'create-team',
    titleKey: 'guidedTour.createTeam.title',
    title: 'Create your team',
    bodyKey: 'guidedTour.createTeam.body',
    body: 'In the Club tab, tap Teams to create your team and add your players to it.',
    targets: [
      {
        selector: '[data-testid="tour-save-team"]',
        hintKey: 'guidedTour.hints.saveTeam',
        hint: 'Name your team, pick its players, and save.',
      },
      {
        selector: '[data-testid="tour-add-team"]',
        hintKey: 'guidedTour.hints.addTeam',
        hint: 'Tap Add Team.',
      },
      {
        selector: '[data-testid="tour-teams"]',
        hintKey: 'guidedTour.hints.tapTeams',
        hint: 'Tap Teams.',
      },
      {
        selector: '[data-testid="tour-tab-club"]',
        hintKey: 'guidedTour.hints.openClubTab',
        hint: 'Open the Club tab.',
      },
    ],
    advanceWhen: (s) => s.hasTeam,
  },
  {
    id: 'create-game',
    titleKey: 'guidedTour.createGame.title',
    title: 'Start your first game',
    bodyKey: 'guidedTour.createGame.body',
    body: 'Tap New Game, then choose your team. Playing in a league or tournament? You can add it here or later.',
    targets: [
      {
        selector: '#teamSelectTop',
        hintKey: 'guidedTour.hints.chooseTeamStart',
        hint: 'Choose your team, then start the game.',
      },
      {
        selector: '[data-testid="tour-new-game"]',
        hintKey: 'guidedTour.hints.tapNewGame',
        hint: 'Tap New Game.',
      },
      {
        selector: '[data-testid="tour-tab-games"]',
        hintKey: 'guidedTour.hints.openGamesTab',
        hint: 'Open the Games tab.',
      },
    ],
    // Advance once a game is created and entered (the match view is showing) - we
    // don't trap the coach if they choose not to link a team; it's re-linkable later.
    advanceWhen: (s) => s.screen === 'home',
  },
  {
    id: 'start-timer',
    titleKey: 'guidedTour.startTimer.title',
    title: 'Start the clock',
    bodyKey: 'guidedTour.startTimer.body',
    body: 'Tap the timer, then Start, when the match kicks off.',
    targets: [
      {
        selector: '[data-testid="tour-timer-startpause"]',
        hintKey: 'guidedTour.hints.tapStart',
        hint: 'Tap Start when the match kicks off.',
      },
      {
        selector: '[data-testid="tour-timer-button"]',
        hintKey: 'guidedTour.hints.openTimer',
        hint: 'Tap the timer.',
      },
    ],
    advanceWhen: (s) => s.isTimerRunning,
  },
  {
    id: 'log-goal',
    titleKey: 'guidedTour.logGoal.title',
    title: 'Log a goal',
    bodyKey: 'guidedTour.logGoal.body',
    body: 'Open the timer and tap the goal button - your stats update live.',
    targets: [
      {
        selector: '[data-testid="tour-log-goal"]',
        hintKey: 'guidedTour.hints.tapGoal',
        hint: 'Tap the goal button - stats update live.',
      },
      {
        selector: '[data-testid="tour-timer-button"]',
        hintKey: 'guidedTour.hints.openTimer',
        hint: 'Tap the timer.',
      },
    ],
    advanceWhen: (s) => s.hasLoggedGoal,
  },
  {
    id: 'done',
    titleKey: 'guidedTour.done.title',
    title: "You're all set",
    bodyKey: 'guidedTour.done.body',
    body: 'That is the basics. Everything you do saves automatically.',
  },
];
