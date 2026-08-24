import type { TourStep } from './tourTypes';

/**
 * Id for the post-signup first-run tour. Used to key the per-user completion
 * flag (`matchops_tour_completed_first-run_<userId>`), so finishing or skipping
 * it once means it never re-triggers for that account.
 */
export const FIRST_RUN_TOUR_ID = 'first-run';

/**
 * The add-players goal is the on-field size of the coach's format - 5v5, 8v8,
 * or 11v11, picked with one tap on the step's chips (default 8, the middle
 * ground). A GOAL, not a gate: the step shows live progress toward it and
 * auto-advances when reached, but closing the roster list earlier (with any
 * players) advances too.
 */

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
    body: 'Open the Club tab, tap Players, and add your squad - enough to field a full team in your format.',
    targets: [
      {
        selector: '[data-testid="tour-save-player"]',
        hintKey: 'guidedTour.hints.savePlayer',
        hint: "Type the player's name - it shows on their disc on the field (or a nickname, if you set one).",
        compact: true,
      },
      {
        selector: '[data-testid="tour-add-player"]',
        hintKey: 'guidedTour.hints.addPlayer',
        hint: 'Tap Add Player. Fill your lineup - or close the list when your squad is in.',
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
    choices: [
      { id: '5v5', label: '5v5', apply: { targetPlayers: 5 } },
      { id: '8v8', label: '8v8', apply: { targetPlayers: 8 } },
      { id: '11v11', label: '11v11', apply: { targetPlayers: 11 } },
    ],
    choicesLabelKey: 'guidedTour.addPlayers.format',
    choicesLabel: 'Format',
    progress: {
      key: 'guidedTour.progress.playersAdded',
      fallback: '{{done}} / {{target}} players added',
      compute: (s) => ({ done: s.playersCount, target: s.targetPlayers }),
    },
    // Reaching the goal advances immediately; closing the list with any players
    // advances too (hasPlayers refreshes on modal close) - a goal, not a gate.
    advanceWhen: (s) => s.playersCount >= s.targetPlayers || s.hasPlayers,
  },
  {
    id: 'create-team',
    titleKey: 'guidedTour.createTeam.title',
    title: 'Create your team',
    bodyKey: 'guidedTour.createTeam.body',
    body: 'In the Club tab, tap Teams to create your team and add your players to it.',
    // In-form sequencing (owner feedback): the team form's controls all exist
    // at once, so `when` gates order them - name first (while empty), then the
    // roster picker (until its Done has been shown), then Create.
    targets: [
      {
        selector: '[data-testid="tour-roster-done"]',
        hintKey: 'guidedTour.hints.rosterDone',
        hint: 'Pick the players for your team, then tap Done.',
        compact: true,
      },
      {
        selector: '[data-testid="tour-team-name"]',
        hintKey: 'guidedTour.hints.teamName',
        hint: 'Give your team a name.',
        compact: true,
        when: () => {
          const el = document.querySelector<HTMLInputElement>('[data-testid="tour-team-name"]');
          return !!el && el.value.trim() === '';
        },
      },
      {
        selector: '[data-testid="tour-edit-roster"]',
        hintKey: 'guidedTour.hints.editRoster',
        hint: 'Tap Edit Roster to pick your players.',
        compact: true,
        when: (seen) => !seen('[data-testid="tour-roster-done"]'),
      },
      {
        selector: '[data-testid="tour-save-team"]',
        hintKey: 'guidedTour.hints.saveTeam',
        hint: 'Tap Create.',
        compact: true,
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
    // Advances the moment the team exists (live teams subscription) - not only
    // when the club modals close.
    advanceWhen: (s) => s.teamsCount > 0 || s.hasTeam,
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
        compact: true,
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
