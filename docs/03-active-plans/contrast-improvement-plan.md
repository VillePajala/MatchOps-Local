# Plan: Increase UI Contrast

## Objective
Make the app appear brighter by increasing contrast while keeping the dark theme aesthetic.

## Branch
Create new branch: `feature/increase-contrast` (from `feature/p4b-upgrade-ui`)

## Key Changes

### 1. Text Colors - Higher Contrast
| Current | Change To | Usage |
|---------|-----------|-------|
| `text-slate-300` | `text-slate-100` | Primary text, labels |
| `text-slate-400` | `text-slate-200` | Secondary text, descriptions |
| `text-slate-500` | `text-slate-300` | Tertiary/muted text |

### 2. Border Colors - More Visible
| Current | Change To | Usage |
|---------|-----------|-------|
| `border-slate-700` | `border-slate-600` | Dividers, containers |
| `border-slate-600` | `border-slate-500` | Interactive elements |

### 3. Button Gradients - Brighter
| Current | Change To | Usage |
|---------|-----------|-------|
| `from-indigo-500 to-indigo-600` | `from-indigo-400 to-indigo-500` | Primary buttons |
| `from-slate-600 to-slate-700` | `from-slate-500 to-slate-600` | Secondary buttons |

### 4. Atmospheric Effects - More Visible
Increase opacity of glow effects:
- `sky-400/5` → `sky-400/10`
- `sky-400/10` → `sky-400/15`
- `indigo-600/5` → `indigo-600/10`

## Files to Modify

### Primary (centralized styles)
1. **`src/styles/modalStyles.tsx`** - Modal design system (most impact)
2. **`src/app/globals.css`** - Global CSS variables and gradients

### Component Updates
3. **`src/components/HomePage/containers/GameContainer.tsx`** - Main layout
4. **`src/components/PlayerBar/PlayerBar.tsx`** - Player roster bar
5. **`src/components/ControlBar/ControlBar.tsx`** - Bottom control bar
6. **`src/components/GameInfoBar.tsx`** - Game info header

### Specific Modals (if not fully using modalStyles)
7. **`src/components/SettingsModal.tsx`** - Settings dialog
8. **`src/components/UpgradePromptModal.tsx`** - Upgrade prompt

## Implementation Steps

1. Create branch `feature/increase-contrast`
2. Update `src/styles/modalStyles.tsx` with new contrast values
3. Update `src/app/globals.css` for global effects
4. Update container components (GameContainer, PlayerBar, ControlBar, GameInfoBar)
5. Verify modal components inherit changes or update individually
6. Visual review of all screens

## Rollback Plan
If changes don't look right, simply switch back to previous branch.
