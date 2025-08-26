# Adaptive Start Screen (Dual-Mode)

## Overview
Switches between a simplified first-time user interface and a full-featured interface for experienced users.

## Detection
```typescript
// src/app/page.tsx
const isFirstTimeUser = !hasSavedGames;
```

## First-Time Mode
- Buttons: Get Started (primary), How It Works (secondary)
- Action: Get Started opens Home with default workspace; center overlay guides roster→first game

## Experienced Mode
- Smart buttons with states:
  - Resume Last Game (enabled/disabled)
  - Create Game (Create New vs Create First; disabled without players)
  - Load Game (enabled when games exist)
  - Seasons & Tournaments (smart text; disabled without players)
  - Setup Team Roster (shown only when no players)

## Styling
- See `src/components/StartScreen.tsx` for button classes and layout

## i18n keys
- `startScreen.getStarted`, `startScreen.howItWorks`, `startScreen.resumeGame`, `startScreen.exploreApp`, `startScreen.createNewGame`, `startScreen.createFirstGame`, `startScreen.createSeasonTournament`, `startScreen.createFirstSeasonTournament`
