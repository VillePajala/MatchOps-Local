# Player Assessment

**Status**: ✅ Implemented
**Last Updated**: January 5, 2026

## Overview

The Player Assessment feature allows coaches to rate and evaluate players after each game. Assessments track 10 performance dimensions plus an overall rating, with optional notes.

## Key Components

- `PlayerAssessmentModal.tsx` - Main modal for entering assessments
- `PlayerAssessmentCard.tsx` - Individual player assessment form
- `AssessmentSlider.tsx` - Slider component for ratings
- `usePlayerAssessments.ts` - Hook for assessment data management
- `playerAssessments.ts` - Storage utilities
- `assessmentStats.ts` - Statistical analysis of assessments

## Data Model

```typescript
interface PlayerAssessment {
  overall: number;        // 1-10 overall rating
  sliders: {
    intensity: number;    // 1-10
    courage: number;      // 1-10
    duels: number;        // 1-10
    technique: number;    // 1-10
    creativity: number;   // 1-10
    decisions: number;    // 1-10
    awareness: number;    // 1-10
    teamwork: number;     // 1-10
    fair_play: number;    // 1-10
    impact: number;       // 1-10
  };
  notes: string;          // Free-form notes
  minutesPlayed: number;  // Time on pitch
  createdAt: number;      // Timestamp
  createdBy: string;      // Coach identifier
}
```

## Assessment Dimensions

| Dimension | Description |
|-----------|-------------|
| Intensity | Effort, work rate, pressing |
| Courage | Willingness to take risks, play forward |
| Duels | Success in 1v1 situations |
| Technique | Ball control, passing accuracy |
| Creativity | Ability to create chances, surprise opponents |
| Decisions | Game reading, choosing right options |
| Awareness | Positioning, spatial awareness |
| Teamwork | Communication, supporting teammates |
| Fair Play | Sportsmanship, respect for rules |
| Impact | Overall influence on game outcome |

## User Flow

1. After a game ends, coach opens Player Assessment from Game Stats
2. Each selected player gets an assessment card
3. Coach rates each dimension using sliders (1-10)
4. Overall rating calculated automatically or set manually
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
