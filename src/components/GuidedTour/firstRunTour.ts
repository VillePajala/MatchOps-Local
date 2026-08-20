import type { TourStep } from './tourTypes';

/**
 * Id for the post-signup first-run tour. Used to key the per-user completion
 * flag (`matchops_tour_completed_first-run_<userId>`), so finishing or skipping
 * it once means it never re-triggers for that account.
 */
export const FIRST_RUN_TOUR_ID = 'first-run';

/**
 * PR1 seed: a minimal welcome + done tour that proves the engine end-to-end
 * (centered cards, Next / Skip / Done, completion persistence, first-run
 * trigger). PR2 inserts the Home-half steps (add players -> create team ->
 * create game) and PR3 the match-half steps (start timer -> log a goal) between
 * these two bookends.
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
    id: 'done',
    titleKey: 'guidedTour.done.title',
    title: "You're all set",
    bodyKey: 'guidedTour.done.body',
    body: 'That is the basics. Everything you do saves automatically.',
  },
];
