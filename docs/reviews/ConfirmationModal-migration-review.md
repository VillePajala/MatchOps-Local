# ConfirmationModal Migration — Verification & Assessment

This document verifies the recent migration from native `window.confirm()` dialogs to a unified, styled `ConfirmationModal` component across the app. It summarizes what changed, where it changed, potential risks, and concrete follow‑ups.

## Overview

- Replaced blocking, unstyled browser confirms with a reusable `ConfirmationModal`.
- Outcomes:
  - Non‑blocking UI that matches the app design
  - Testable confirmation flows (no browser blocking)
  - Centralized look, feel, and behavior

## Verification Summary

What I checked and found:

- Central modal component in use
  - `src/components/ConfirmationModal.tsx`
    - Styled via `src/styles/modalStyles.tsx`
    - Supports danger/primary variants, custom labels, warnings

- Legacy confirms removed from app surfaces (now modal state booleans + `ConfirmationModal` renders):
  - Home page flows
    - No players, hard reset, save‑before‑new, start‑new
    - State + modals present: `src/components/HomePage.tsx:3568`, `:3592`, `:3617`
  - Settings
    - App update available, restore from backup
    - State + modals: `src/components/SettingsModal.tsx:586`, `:608`
  - Seasons/Tournaments management
    - Delete confirm: `src/components/SeasonTournamentManagementModal.tsx:422`
  - Game stats — goal deletion
    - Hook exposes confirm state; parent renders modal
    - Hook: `src/components/GameStatsModal/hooks/useGoalEditor.ts:17`, `:101`, `:141`
    - Modal: `src/components/GameStatsModal.tsx:912`
  - Goal log modal
    - Delete confirm: `src/components/GoalLogModal.tsx:543`
  - Timer overlay
    - Reset and opponent goal confirmations added: `src/components/TimerOverlay.tsx:407`, `:417`

- Fallback still in utility (intentional)
  - `src/utils/fullBackup.ts:155` keeps a `window.confirm` branch for stand‑alone usage; Settings path bypasses it by passing `confirmed: true` and using the modal first.

## Findings

- Missing i18n keys (uses fallbacks currently):
  - Examples include titles/messages like `controlBar.noPlayersTitle`, `controlBar.saveBeforeNewTitle`, `controlBar.startNewMatchTitle`, `settingsModal.updateAvailableTitle`, `gameStatsModal.confirmDeleteEventTitle`, `timerOverlay.confirmResetTitle`, etc.
  - Impact: UI shows hardcoded English strings via fallbacks; functionally OK but not localized.

- Tests need providers:
  - `GameStatsModal` now calls `useToast`; tests that render it should wrap with `ToastProvider`. Some failures were mentioned as cosmetic.

- Accessibility polish opportunities:
  - Add `role="dialog"` and `aria-modal="true"` to `ConfirmationModal` container, trap focus, and return focus to the trigger on close.

- Consistent layering/z‑index:
  - `ConfirmationModal` uses `z-[70]`; other large modals commonly use `z-[60]` and overlays under that. Current stacking is coherent; keep the convention documented.

- Utility confirm fallback (optional cleanup):
  - If all callers now handle confirmation via `ConfirmationModal`, remove the `window.confirm` branch in `fullBackup.ts` to prevent future regressions.

## Recommendations (Actionable)

1) Add translation keys for all new modal titles/buttons/messages.
2) Update tests to include `ToastProvider` (and any modal context, if needed).
3) Enhance `ConfirmationModal` a11y:
   - Add `role="dialog"`, `aria-modal="true"`, focus trap, and focus return.
4) Consider removing the `window.confirm` fallback from `fullBackup.ts` or keep it clearly documented as a CLI/utility‑only path.

## Impact/Risk Assessment

- UX: Consistent, non‑blocking confirmations across the app. Positive impact.
- QA/testing: Easier to simulate confirm/deny actions in tests. Positive impact.
- Risk: Low. Main risks are untranslated strings and tests missing providers.

## Appendix — Notable References

- Modal component: `src/components/ConfirmationModal.tsx:1`
- Shared styles: `src/styles/modalStyles.tsx:1`
- HomePage confirmations: `src/components/HomePage.tsx:3568`, `:3592`, `:3617`
- Settings confirmations: `src/components/SettingsModal.tsx:586`, `:608`
- ST management delete confirm: `src/components/SeasonTournamentManagementModal.tsx:422`
- GameStats delete confirm: `src/components/GameStatsModal.tsx:912`
- GoalLog delete confirm: `src/components/GoalLogModal.tsx:543`
- TimerOverlay confirmations: `src/components/TimerOverlay.tsx:407`, `:417`
- Utility fallback: `src/utils/fullBackup.ts:155`
