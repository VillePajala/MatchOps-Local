# Robust Alert System

## Goals
- Consistent roster-related alerts with i18n
- Prevent duplicate alerts
- Offer next-step guidance

## Behavior
- Single translation key used across entry points
- Checks happen early (before dead-end modals)
- useEffect dependencies tuned to avoid repeated prompts

## Example
```ts
if (availablePlayers.length === 0) {
  const shouldOpen = window.confirm(t('controlBar.noPlayersForNewGame'));
  if (shouldOpen) setIsRosterModalOpen(true);
}
```

## Notes
- Alerts always show explanatory text (no variable names)
- Applies to start-screen and control-bar entry points
