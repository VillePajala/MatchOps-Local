import type { ArrowKind, Concept, ConceptStep, ConceptZone, Point } from './types';

/** An arrow with both ends turned into points. */
export interface ResolvedArrow {
  kind: ArrowKind;
  from: Point;
  to: Point;
  bend: number;
  /** The player the arrow starts from, when it starts from one. */
  fromId?: string;
}

/** A zone with a poly's player ids turned into points. */
export type ResolvedZone =
  | Exclude<ConceptZone, { kind: 'poly' }>
  | { kind: 'poly'; points: Point[]; label?: string };

export interface ResolvedStep {
  /** Clamped into range. */
  index: number;
  step: ConceptStep;
  /** Every player's position at this step (moves accumulate from step 0). */
  positions: Record<string, Point>;
  /** Where the ball is and who has it; null when no step so far placed it. */
  ball: { at: Point; holder?: string } | null;
  arrows: ResolvedArrow[];
  zones: ResolvedZone[];
  highlights: string[];
  isFirst: boolean;
  isLast: boolean;
}

/** Long passes curve unless the concept says otherwise. */
const DEFAULT_BEND: Partial<Record<ArrowKind, number>> = { long: 0.18 };

/**
 * The state of a concept at one step: positions and the ball accumulate from
 * the first step to `stepIndex` (a step only lists what changes). Arrows,
 * zones and highlights belong to the step itself; their player references
 * resolve against the positions AT this step, so an arrow shows the move or
 * pass that is about to happen from where the players now stand.
 *
 * Pure. Assumes a concept that passed validateConcept; an unknown id resolves
 * to the pitch centre rather than throwing.
 */
export function resolveStep(concept: Concept, stepIndex: number): ResolvedStep {
  const last = concept.steps.length - 1;
  const index = Math.max(0, Math.min(last, Math.floor(stepIndex)));

  const positions: Record<string, Point> = {};
  for (const p of concept.players) positions[p.id] = [p.start[0], p.start[1]];

  let ballRef: string | Point | undefined;
  for (let i = 0; i <= index; i++) {
    const s = concept.steps[i];
    if (s.positions) {
      for (const [id, pt] of Object.entries(s.positions)) positions[id] = [pt[0], pt[1]];
    }
    if (s.ball !== undefined) ballRef = s.ball;
  }

  const at = (ref: string | Point): Point =>
    typeof ref === 'string' ? (positions[ref] ?? [34, 50]) : [ref[0], ref[1]];

  const step = concept.steps[index];
  const ball =
    ballRef === undefined
      ? null
      : typeof ballRef === 'string'
        ? { at: at(ballRef), holder: ballRef }
        : { at: at(ballRef) };

  const arrows: ResolvedArrow[] = (step.arrows ?? []).map((a) => ({
    kind: a.kind,
    from: at(a.from),
    to: at(a.to),
    bend: a.bend ?? DEFAULT_BEND[a.kind] ?? 0,
    ...(typeof a.from === 'string' ? { fromId: a.from } : {}),
  }));

  const zones: ResolvedZone[] = (step.zones ?? []).map((z) =>
    z.kind === 'poly' ? { kind: 'poly', points: z.ids.map((id) => at(id)), label: z.label } : z,
  );

  return {
    index,
    step,
    positions,
    ball,
    arrows,
    zones,
    highlights: step.highlights ?? [],
    isFirst: index === 0,
    isLast: index === last,
  };
}
