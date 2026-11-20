# Player Assessment

**Status**: ✅ Implemented
**Last Updated**: 2026-11-20

## Overview

The Player Assessment feature allows coaches to rate and evaluate players after each game. Assessments track a template-defined set of metrics (10 in the default template) plus an overall rating, with optional notes.

## Key Components

- `PlayerAssessmentModal.tsx` - Main modal for entering assessments
- `PlayerAssessmentCard.tsx` - Individual player assessment form
- `AssessmentSlider.tsx` - Slider component for ratings
- `usePlayerAssessments.ts` - Hook for assessment data management
- `playerAssessments.ts` - Storage utilities
- `assessmentStats.ts` - Statistical analysis of assessments

## Data Model

```typescript
// src/types/playerAssessment.ts
interface PlayerAssessment {
  overall: number;                 // 1-10 holistic rating
  sliders: Record<string, number>; // id-keyed, canonical 1-10 per metric
  sliderScaleVersion?: number;     // scale gate; older scales migrated on read
  notes: string;
  minutesPlayed: number;
  createdAt: number;
  createdBy: string;
}
```

Metrics are defined in `src/config/assessmentMetrics.ts` (single source of truth). Legacy ids (`intensity`, `duels`, `technique`, `awareness`, `impact`, ...) are mapped onto the current set on read by `migrateAssessmentSliders`.

## Assessment Dimensions

The coach picks a template (`ASSESSMENT_TEMPLATES`):

| Template | Metrics |
|----------|---------|
| `balanced` (default, "set A") | ball_control, passing, scanning, game_reading, decisions, courage, effort, enjoyment, teamwork, fair_play |
| `light6` (U7-U9) | ball_control, courage, effort, enjoyment, teamwork, fair_play |
| `creative` | balanced + creativity, dribbling, finishing, off_ball_movement |

Values are stored on a canonical 1-10 scale; display/entry style is a per-user setting (`assessmentRatingStyle`: `words` 5-level, `num5`, `num10`).

## User Flow

1. After a game ends, coach opens assessments from the timer view ("Assess players", or the assessment step of the "Finish this game" flow)
2. Each selected player gets an assessment card
3. Coach rates each metric in the chosen rating style (words, 1-5 or 1-10)
4. Coach sets the overall rating (1-10)
5. Optional notes can be added
6. Assessments saved per player per game

## Storage

- Assessments stored in game's `AppState.playerAssessments`
- Persisted to IndexedDB with game data
- Included in game exports and backups

## Statistics

The `assessmentStats.ts` utility provides:
- Average ratings per player across games
- Trend analysis over time
- Comparison between players
- Dimension-specific aggregations

## Translations

Fully internationalized (EN/FI) including:
- All dimension labels
- Instructions and tooltips
- Button labels

## Related Features

- [Game Statistics](./seasons-tournaments.md) - Assessment data shown in stats
- [External Matches](./external-matches.md) - Can add assessments for external games
