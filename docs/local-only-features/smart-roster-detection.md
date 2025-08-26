# Smart Roster Detection System

## Overview
Prevents creating games without any players in the roster and guides users to roster setup.

## Behavior
- Control Bar → New Game: if roster empty, show confirm and route to Roster Settings.
- Start Screen → Start New Game: same check to avoid empty setup modal.

## Implementation
- Guard in `handleStartNewGame` (see `src/components/HomePage.tsx`):
```typescript
if (availablePlayers.length === 0) {
  const shouldOpenRoster = window.confirm(t('controlBar.noPlayersForNewGame'));
  if (shouldOpenRoster) setIsRosterModalOpen(true);
}
```
- Linked in initial action handling for start-screen navigation.

## i18n
- EN: "You need at least one player in your roster to create a game. Would you like to add players now?"
- FI: "Tarvitset vähintään yhden pelaajan kokoonpanoon luodaksesi pelin. Haluatko lisätä pelaajia nyt?"
