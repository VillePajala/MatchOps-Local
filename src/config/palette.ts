/**
 * The app's colour systems, named.
 *
 * WHY THIS EXISTS. MatchOps does not have one palette, it has FOUR, and until
 * this file they lived only inside the class strings of whichever component
 * happened to need them. Nobody could see the system, so nobody could follow
 * it - and two components ended up rendering the same concept in contradictory
 * colours (sky meant "goalkeeper" in one view and "defender" in another).
 *
 * The four systems, and the fact that they SHARE a hue space:
 *
 *   1. ENTITY_DOT     - what kind of thing is this? (season, league, cup...)
 *   2. POSITION_ROLE  - where on the pitch? (keeper, defence, midfield, attack)
 *   3. STATUS         - what state is it in? (warning, due, live, synced)
 *   4. UI             - primary, call-to-action, danger
 *
 * Hues therefore collide ACROSS systems and that is tolerable, because the
 * systems never appear in the same component: amber is the series badge, the
 * goalkeeper role AND the primary call-to-action. What is NOT tolerable is a
 * hue meaning two things inside one system, which is the contradiction this
 * file was written to settle.
 *
 * HOW TO USE. Import the constant instead of typing a colour class. These are
 * whole literal class strings on purpose - Tailwind scans `src/**` for
 * complete class names, so a composed string like `bg-${hue}-400` would be
 * purged from the build and silently render unstyled.
 *
 * @module palette
 * @category Config
 */

/**
 * What kind of thing a row refers to. Shown as a 1.5px dot before the label in
 * game lists, the team manager and the competition manager.
 *
 * These are CATEGORICAL: the hues carry no ordering and no severity, they only
 * have to stay distinguishable from one another. Never collapse two of them
 * for looking similar - each one is the only thing separating a league badge
 * from a cup badge at a glance.
 */
export const ENTITY_DOT = {
  /** Soccer vs futsal. */
  gameType: 'bg-orange-400',
  gender: 'bg-pink-400',
  /** A league / "season" in the app's older vocabulary. */
  season: 'bg-blue-400',
  league: 'bg-cyan-400',
  tournament: 'bg-purple-400',
  /** A level or series inside a tournament. */
  series: 'bg-amber-400',
  /** The club's own year, computed rather than chosen. */
  clubSeason: 'bg-green-400',
} as const;

/**
 * Where a position sits on the pitch.
 *
 * THE KEEPER IS AMBER because the keeper's disc on the field is orange
 * (`#F97316`). A coach who has looked at the pitch all season already reads
 * warm as "keeper", and a chart that disagreed with the field would be
 * teaching them a second, contradictory convention.
 *
 * Defence-to-attack then runs cool-to-warm - sky, emerald, rose - which gives
 * the line a direction rather than four unrelated colours.
 */
export const POSITION_ROLE = {
  gk: 'amber',
  def: 'sky',
  mid: 'emerald',
  att: 'rose',
} as const;

/** Canvas and inline-style equivalents of POSITION_ROLE (the 400 weights). */
export const POSITION_ROLE_HEX = {
  gk: '#fbbf24',
  def: '#38bdf8',
  mid: '#34d399',
  att: '#fb7185',
} as const;

/**
 * What state something is in.
 *
 * `subWarning` -> `subDue` is an ESCALATION, not two unrelated colours: the
 * substitution timer walks from neutral through orange to red. Flattening
 * orange into amber here would turn a three-step warning into two.
 */
export const STATUS = {
  /** Substitution window approaching. */
  subWarning: 'text-orange-300',
  /** Substitution overdue. */
  subDue: 'text-red-400',
  /** Finished, imported, saved. */
  success: 'emerald',
  /** Running right now - the match clock. */
  live: 'green',
  /** Cloud sync and the migration wizards. */
  sync: 'sky',
} as const;

/**
 * Ordinary interface colour.
 *
 * PRIMARY IS PURPLE, not the indigo it was. The app's most recognisable
 * surface is the pitch, where every player disc is #7E22CE - which is exactly
 * tailwind's purple-700. The chrome was indigo, a neighbouring hue chosen by
 * nobody in particular, so the product's own colour appeared on one screen and
 * nowhere else. Matching weights (indigo-600 -> purple-600) puts the interface
 * in the same family as the discs.
 *
 * `cta` is amber and is deliberately scarce: on the home screen amber means
 * one thing, "press this". Spending it on decoration is what makes a call to
 * action stop being one.
 */
export const UI = {
  primary: 'purple',
  cta: 'amber',
  danger: 'red',
  /** The brand purple, currently the player discs on the field. */
  brand: '#7E22CE',
  /** The goalkeeper's disc on the field. */
  brandKeeper: '#F97316',
} as const;

export type EntityDotKind = keyof typeof ENTITY_DOT;
export type PositionRole = keyof typeof POSITION_ROLE;
