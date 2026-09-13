/**
 * Modal chrome: the backdrop, and the layer a thing sits on.
 *
 * WHY THIS EXISTS. There are 31 modals and no shared shell, so each one
 * retyped its own backdrop. They had drifted: twenty used `bg-black
 * bg-opacity-70`, three used `bg-black/60` with a blur, one used
 * `bg-black/50`, and the stacking order was eight undocumented z-values
 * ranging from 25 to 9999.
 *
 * Nobody notices that one dialog's backdrop is 60% black instead of 70%.
 * People notice that the app feels slightly loose, and they cannot say why.
 *
 * This is deliberately NOT a component. Wrapping 31 modals in a shared shell
 * is a refactor with real regression surface - focus traps, hardware-back
 * registration, scroll locking - and it should be its own change, reviewed on
 * its own. Constants get the consistency now at almost no risk.
 *
 * @module modalStyles
 * @category Config
 */

/**
 * The one backdrop.
 *
 * No blur. Three modals had `backdrop-blur-sm` and twenty did not; matching
 * the twenty changes the fewest pixels, and a blur behind a full-screen sheet
 * costs a compositor pass on exactly the cheap Android hardware this app is
 * meant to run well on.
 *
 * Written `bg-black/70` rather than the `bg-black bg-opacity-70` it replaces:
 * same output, but the opacity utility is Tailwind 3 syntax and this project
 * is on Tailwind 4.
 */
export const MODAL_BACKDROP =
  'fixed inset-0 bg-black/70 flex items-center justify-center font-display';

/**
 * The backdrop for something that opens ON TOP of another surface and has to
 * be resolved before anything else: a confirm, a blocking progress overlay.
 *
 * Lighter than the plain backdrop but blurred, which is the point - the parent
 * stays visible enough to keep your place, and out of focus enough to say
 * "this one first". The app already did this in three places and simply had
 * not named it; one inline delete confirm had drifted to an unblurred 50% and
 * is brought back in line here.
 *
 * The blur cost that rules it out for ordinary modals is acceptable here
 * because these are short-lived and rarely more than one deep.
 */
export const MODAL_BACKDROP_BLOCKING =
  'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center font-display';

/**
 * What sits on top of what.
 *
 * The ladder was inferred from what the app already does, not invented - the
 * numbers are the ones in use, given names so the next modal picks a rung
 * instead of guessing a number one higher than whatever it must beat.
 *
 * Gaps between rungs are intentional: something will eventually need to sit
 * between two of these, and it should not have to renumber the ladder.
 */
export const Z_LAYER = {
  /** Field overlays and in-page affordances that sit above the pitch. */
  fieldOverlay: 'z-[25]',
  /**
   * Scrim behind a slide-up PANEL or menu - the field tools sheet, the control
   * bar menu. Not a modal backdrop: a panel is dismissed by tapping past it
   * rather than resolved, so its scrim is lighter and sits below the modal
   * layer on purpose.
   */
  panelScrim: 'z-[40]',
  /** A blocking overlay owned by a screen rather than a dialog. */
  screenOverlay: 'z-[50]',
  /** The ordinary modal layer - most of the app's dialogs. */
  modal: 'z-[60]',
  /** A modal opened FROM a modal, which must cover its parent. */
  modalNested: 'z-[70]',
  /** Full-screen takeovers: wizards, first-run, the guided tour. */
  takeover: 'z-[80]',
  /** Confirms and destructive prompts - always above their subject. */
  confirm: 'z-[85]',
  /** Toasts, which must clear everything including a confirm. */
  toast: 'z-[100]',
} as const;

export type ZLayer = keyof typeof Z_LAYER;
