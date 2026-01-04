# UI/UX Style Guide

This document outlines the design system and styling conventions for MatchOps to ensure a cohesive and professional user experience.

**Last Updated**: January 4, 2026

---

## 1. Design Philosophy

MatchOps uses a **dark-first, sports-professional** aesthetic designed for:
- Outdoor/sideline use (high contrast, readable in sunlight)
- Touch-first interaction (large tap targets, swipe-friendly)
- Quick glanceability (important info prominent)
- Professional sports app feel (slate/indigo palette, subtle effects)

---

## 2. Tailwind Configuration

### Custom Breakpoints
```javascript
// tailwind.config.js
screens: {
  'xs': '475px',  // Extra small devices
  // Default: sm:640px, md:768px, lg:1024px, xl:1280px
}
```

### Custom Fonts
```javascript
fontFamily: {
  sans: ['var(--font-rajdhani)', 'Inter', 'sans-serif'],
  display: ['var(--font-rajdhani)', 'sans-serif'],
}
```
**Rajdhani** is the primary typeface - a geometric sans-serif that works well for sports/stats.

### Custom Backgrounds
```javascript
backgroundImage: {
  'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
  'noise-texture': "url('/noise.svg')",  // Subtle grain overlay
}
```

---

## 3. Color System

### Primary Palette (Dark Theme)

| Purpose | Color | Tailwind Class |
|---------|-------|----------------|
| **Background Base** | Slate 800 | `bg-slate-800` |
| **Background Deep** | Slate 900 | `bg-slate-900` |
| **Surface** | Slate 800/40-80 | `bg-slate-800/40`, `bg-slate-800/60` |
| **Primary Action** | Indigo 600 | `bg-indigo-600`, `hover:bg-indigo-700` |
| **Accent/Highlight** | Yellow 400 | `text-yellow-400` |
| **Success** | Green 500 | `text-green-500`, `bg-green-500` |
| **Warning** | Yellow 500 | `text-yellow-500` |
| **Error/Delete** | Red 500 | `text-red-500`, `hover:text-red-500` |
| **Text Primary** | Slate 100 | `text-slate-100` |
| **Text Secondary** | Slate 400 | `text-slate-400` |
| **Text Muted** | Slate 500 | `text-slate-500` |
| **Border Subtle** | Slate 700/20-50 | `border-slate-700/20`, `border-slate-700/50` |
| **Focus Ring** | Indigo 500 | `focus:ring-indigo-500`, `border-indigo-500` |

### Gradient Overlays
```css
/* Top gradient for depth */
bg-gradient-to-b from-sky-400/10 via-transparent to-transparent

/* Background tint */
bg-indigo-600/10 mix-blend-soft-light

/* Glow effects (positioned absolutely) */
bg-sky-400/5 blur-2xl opacity-50
bg-indigo-600/5 blur-2xl opacity-50
```

---

## 4. Typography

### Font Stack
- **Primary**: Rajdhani (loaded via Next.js font optimization)
- **Fallback**: Inter, system sans-serif

### Type Scale

| Element | Classes |
|---------|---------|
| Modal Title | `text-3xl font-bold tracking-wide text-yellow-400 drop-shadow-lg` |
| Section Header | `text-xl font-semibold text-slate-100` |
| Body Text | `text-base text-slate-100` |
| Secondary Text | `text-sm text-slate-400` |
| Stats/Numbers | `text-yellow-400 font-semibold` |
| Labels | `text-sm font-medium text-gray-700 dark:text-gray-300` |

---

## 5. Layout & Spacing

### Modal Structure
All modals follow a three-section pattern:

```
┌─────────────────────────────┐
│        FIXED HEADER         │  pt-10 pb-4, backdrop-blur-sm
│         Modal Title         │
├─────────────────────────────┤
│      FIXED CONTROLS         │  px-6, backdrop-blur-sm
│    Stats / Primary Actions  │
├─────────────────────────────┤
│                             │
│    SCROLLABLE CONTENT       │  flex-1 overflow-y-auto min-h-0
│       List Items, etc.      │  px-4, space-y-1.5
│                             │
├─────────────────────────────┤
│        FIXED FOOTER         │  p-4, border-t border-slate-700/20
│       Action Buttons        │
└─────────────────────────────┘
```

### Common Spacing
- **List items**: `space-y-1.5`
- **Major sections**: `space-y-4` or `space-y-5`
- **Control padding**: `px-6`
- **Content padding**: `px-4`

### Grid Patterns
```css
/* Two-column balanced */
grid-cols-[60%_40%]

/* Responsive form */
grid-cols-1 sm:grid-cols-2 gap-3
```

---

## 6. Interactive Elements

### Buttons

**Primary Action:**
```css
bg-indigo-600 hover:bg-indigo-700
w-full px-4 py-2 rounded-md
text-white font-medium
transition-colors
```

**Icon Button:**
```css
p-1.5 rounded-md transition-colors
text-slate-400 hover:text-indigo-400
disabled:opacity-50 disabled:cursor-not-allowed
```

**Destructive Action:**
```css
text-slate-400 hover:text-red-500
```

### Form Controls

**Text Input:**
```css
w-full px-3 py-2 rounded-md
bg-slate-700 border border-slate-600
text-slate-100 placeholder-slate-400
focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
```

**Select:**
```css
w-full px-3 py-2 rounded-md
bg-slate-700 border border-slate-600
text-slate-100
focus:ring-2 focus:ring-indigo-500
```

**Checkbox:**
```css
form-checkbox h-5 w-5
text-indigo-600 bg-slate-600
border-slate-500 rounded
focus:ring-indigo-500
```

### List Items
```css
/* Container */
p-2 rounded-md border
bg-slate-800/40 border-slate-700/50
hover:bg-slate-800/60 transition-colors

/* Active/Selected */
bg-slate-700/75 border-indigo-500
```

---

## 7. Effects & Visual Treatments

### Backdrop Blur
Use `backdrop-blur-sm` for layered elements to create depth:
```css
backdrop-blur-sm bg-slate-900/20
```

### Shadows
- **Inner depth**: `shadow-inner`
- **Text emphasis**: `drop-shadow-lg`

### Noise Texture
Apply via `bg-noise-texture` for subtle grain on modal backgrounds.

### Background Patterns

**Grid Squares** (subtle grid overlay):
```css
.bg-grid-squares {
  background-image:
    linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 32px 32px;
}
```

**Spiderweb** (radial pattern for special screens):
```css
.bg-spiderweb { /* See globals.css for full implementation */ }
```

**Vignette** (edge darkening):
```css
.bg-vignette {
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 100%);
}
```

---

## 8. Custom Animations

All animations defined in `src/app/globals.css`:

| Animation | Class | Use Case |
|-----------|-------|----------|
| Slow pulse | `animate-pulse-slow` | Loading indicators |
| Slow rotation | `animate-rotate-slow` | Background effects (60s cycle) |
| Fade slide in | (keyframe) | Toast notifications |
| Logo float | `logo-float` | Idle logo animation |
| Logo glow | `logo-glow` | Logo emphasis |
| Gentle rotate | `gentle-rotate` | Subtle logo movement |

### Animation Definitions
```css
@keyframes pulse-slow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
.animate-pulse-slow {
  animation: pulse-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes rotate-slow {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.animate-rotate-slow {
  animation: rotate-slow 60s linear infinite;
}
```

---

## 9. Z-Index Layering

| Layer | Z-Index | Usage |
|-------|---------|-------|
| Base content | 0 | Normal flow |
| Floating UI | 10 | Tooltips, dropdowns |
| Fixed bars | 20-30 | Control bar, headers |
| Modals | 50-60 | Modal overlays |
| Toast notifications | 70+ | Alert toasts |
| Critical overlays | 100+ | Error boundaries |

Standard modal: `z-[60]`

---

## 10. PWA-Specific Styling

### Safe Viewport Height
```css
html, body {
  height: 100vh;   /* Fallback */
  height: 100svh;  /* Safe viewport height - prevents bottom UI overlap */
}
```

### Touch Targets
Minimum touch target: `44x44px` (iOS Human Interface Guidelines)
- Buttons: `min-h-[44px]` or `py-3`
- List items: `p-3` minimum
- Icon buttons: `p-2.5` or larger

### Overflow Handling
```css
/* Prevent rubber-banding on iOS */
overscroll-behavior: contain;

/* Scrollable areas */
overflow-y: auto;
-webkit-overflow-scrolling: touch;
```

---

## 11. Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| `xs` | 475px | Extra small phones |
| `sm` | 640px | Small tablets, large phones |
| `md` | 768px | Tablets |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Large desktop |

### Common Patterns
```css
/* Stack on mobile, side-by-side on tablet+ */
flex flex-col sm:flex-row

/* Full width mobile, constrained on larger */
w-full sm:w-auto sm:max-w-md

/* Hide on mobile, show on tablet+ */
hidden sm:block
```

---

## 12. Component Patterns

### Modal Pattern
```tsx
<div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] font-display">
  <div className="bg-slate-800 flex flex-col h-full w-full bg-noise-texture relative overflow-hidden">
    {/* Header */}
    <div className="flex justify-center items-center py-8 backdrop-blur-sm bg-slate-900/20">
      <h2 className="text-3xl font-bold text-yellow-400 tracking-wide drop-shadow-lg">
        {title}
      </h2>
    </div>

    {/* Scrollable Body */}
    <div className="flex-1 overflow-y-auto min-h-0 space-y-6 backdrop-blur-sm bg-slate-900/20 px-4">
      {children}
    </div>

    {/* Footer */}
    <div className="p-4 border-t border-slate-700/20 backdrop-blur-sm bg-slate-900/20">
      {actions}
    </div>
  </div>
</div>
```

### Card Pattern
```tsx
<div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60 transition-colors">
  {/* Card content */}
</div>
```

---

## 13. Accessibility

- **Focus indicators**: `focus:ring-2 focus:ring-indigo-500`
- **Color contrast**: Yellow-400 on slate-800 = 7.5:1 ratio (AAA)
- **ARIA attributes**: All interactive elements have appropriate labels
- **Keyboard navigation**: Tab order follows visual order
- **Touch targets**: Minimum 44x44px

---

## 14. Internationalization (i18n)

All user-facing text must be internationalized using `react-i18next`:
- Use `t()` function for all static strings
- Key structure: `modalName.component.keyName`
- Languages: English (en), Finnish (fi)
- Translation files: `public/locales/{lang}/common.json`

---

## 15. Data Flow Pattern (Modals)

- Do not fetch data inside modal components
- Source data via React Query in container/root components (HomePage)
- Pass data as props to modals
- Mutations must invalidate React Query keys for fresh data

See: `docs/02-technical/data-freshness-and-modal-data-flow.md`

---

## 16. Implementation Status

All modals have been updated to match this style guide:
- ✅ RosterSettingsModal
- ✅ GameSettingsModal
- ✅ GameStatsModal
- ✅ GoalLogModal
- ✅ LoadGameModal
- ✅ NewGameSetupModal
- ✅ SeasonTournamentManagementModal
