# 11. UI Patterns — Routes, Components, Modals, Forms, Interactive Canvas

> **Audience**: AI agent building the new app
> **Purpose**: How to structure the UI layer with Next.js App Router, feature-based components, and interactive elements

---

## 1. Route Structure

```
src/app/
├── layout.tsx              # Root layout (providers, fonts, meta)
├── page.tsx                # Dashboard / home
├── practice/
│   ├── page.tsx            # Practice list (browse, filter)
│   └── [id]/page.tsx       # Practice editor (blocks, timeline)
├── exercises/
│   ├── page.tsx            # Exercise library (browse, search)
│   └── [id]/page.tsx       # Exercise detail + field diagram
├── calendar/
│   └── page.tsx            # Training calendar view
├── roster/
│   └── page.tsx            # Player management
├── templates/
│   └── page.tsx            # Practice templates
└── settings/
    └── page.tsx            # App settings
```

**Key difference from MatchOps-Local**: Multi-route instead of single-page orchestrator. Each route owns its own state and hooks. No 1240-line page.tsx.

---

## 2. Layout Patterns

### Root Layout

```tsx
// src/app/layout.tsx

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <I18nInitializer>
          <ServiceWorkerRegistration />
          <InstallPrompt />
          <QueryProvider>
            <AuthProvider>
              <ToastProvider>
                <Navigation />
                <main className="pb-16 md:pl-64">
                  {children}
                </main>
              </ToastProvider>
            </AuthProvider>
          </QueryProvider>
        </I18nInitializer>
      </body>
    </html>
  );
}
```

### Navigation

Mobile: bottom tab bar. Desktop: side navigation.

```tsx
// src/components/Navigation.tsx

const NAV_ITEMS = [
  { href: '/', icon: HomeIcon, label: 'Home' },
  { href: '/practice', icon: ClipboardIcon, label: 'Practice' },
  { href: '/exercises', icon: BookIcon, label: 'Exercises' },
  { href: '/calendar', icon: CalendarIcon, label: 'Calendar' },
  { href: '/roster', icon: UsersIcon, label: 'Roster' },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: sidebar */}
      <nav className="hidden md:block fixed left-0 top-0 h-full w-64 bg-slate-900 border-r border-slate-700">
        {NAV_ITEMS.map(item => (
          <Link key={item.href} href={item.href}
            className={pathname === item.href ? 'bg-slate-800' : ''}>
            <item.icon /> {item.label}
          </Link>
        ))}
      </nav>

      {/* Mobile: bottom tabs */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 z-40">
        <div className="flex justify-around">
          {NAV_ITEMS.map(item => (
            <Link key={item.href} href={item.href}
              className={pathname === item.href ? 'text-blue-400' : 'text-slate-400'}>
              <item.icon className="h-6 w-6" />
              <span className="text-xs">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
```

---

## 3. Feature Component Organization

```
src/features/practice/
├── components/
│   ├── PracticeList.tsx        # Filterable list
│   ├── PracticeCard.tsx        # List item
│   ├── PracticeEditor.tsx      # Block timeline editor
│   ├── BlockEditor.tsx         # Single block editor
│   ├── BlockTimeline.tsx       # Visual timeline
│   └── AddBlockModal.tsx       # Modal for adding blocks
├── hooks/
│   ├── usePracticeSessions.ts  # React Query CRUD
│   ├── usePracticeEditor.ts    # Editor state
│   └── usePracticeBlockReducer.ts
└── utils/
    └── practiceCalculations.ts # Duration, timing logic
```

Each feature is self-contained. Shared components go in `src/components/`.

---

## 4. Modal Pattern

**Use `@headlessui/react` for accessible modals** (not a central modal registry):

```tsx
// src/features/practice/components/AddBlockModal.tsx

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';

interface AddBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (block: PracticeBlock) => void;
}

export function AddBlockModal({ isOpen, onClose, onAdd }: AddBlockModalProps) {
  const [blockType, setBlockType] = useState<BlockType>('main');
  const [duration, setDuration] = useState(15);

  const handleSubmit = () => {
    onAdd({
      id: generateId('block'),
      blockType,
      durationMinutes: duration,
      title: getDefaultTitle(blockType),
      // ...
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="bg-slate-800 rounded-lg max-w-md w-full p-6">
          <DialogTitle className="text-lg font-semibold text-white">
            Add Block
          </DialogTitle>

          {/* Form fields */}
          <select value={blockType} onChange={e => setBlockType(e.target.value as BlockType)}>
            <option value="warmup">Warm-up</option>
            <option value="main">Main Activity</option>
            <option value="cooldown">Cool-down</option>
            <option value="break">Break</option>
          </select>

          <input type="number" value={duration}
            onChange={e => setDuration(Number(e.target.value))}
            min={1} max={120}
          />

          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onClose}>Cancel</button>
            <button onClick={handleSubmit}>Add</button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
```

**Key advantage over central registry**: Each feature owns its modals. No 40-modal registry file.

### Dynamic Import for Large Modals

```tsx
import dynamic from 'next/dynamic';

const ExerciseDetailModal = dynamic(
  () => import('./ExerciseDetailModal'),
  { loading: () => <div>Loading...</div> }
);
```

---

## 5. Form Patterns

### Controlled Forms with Validation

```tsx
function ExerciseForm({ exercise, onSave }: { exercise?: Exercise; onSave: (data: ExerciseFormData) => void }) {
  const [name, setName] = useState(exercise?.name ?? '');
  const [category, setCategory] = useState(exercise?.category ?? 'passing');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (name.length > 100) newErrors.name = 'Name must be under 100 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSave({ name: name.trim(), category, /* ... */ });
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Name
        <input value={name} onChange={e => setName(e.target.value)}
          className={errors.name ? 'border-red-500' : 'border-slate-600'} />
        {errors.name && <p className="text-red-400 text-sm">{errors.name}</p>}
      </label>
      {/* ... */}
      <button type="submit">Save</button>
    </form>
  );
}
```

---

## 6. Interactive Field Diagram — Canvas Component

The most complex UI component. Used for exercise field setup visualization.

### Architecture

```
┌─────────────────────────────┐
│      FieldDiagramEditor      │
│                              │
│  ┌────────────────────────┐ │
│  │      Canvas Element     │ │
│  │  (draw field, markers)  │ │
│  └─────────┬──────────────┘ │
│             │                │
│  ┌─────────▼──────────────┐ │
│  │    Event Handlers       │ │
│  │  (touch/click/drag)     │ │
│  └────────────────────────┘ │
│                              │
│  ┌────────────────────────┐ │
│  │    Toolbar              │ │
│  │  (tools, colors, clear) │ │
│  └────────────────────────┘ │
└─────────────────────────────┘
```

### Position Handling with Relative Coordinates

```typescript
// All positions stored as relative (0-1 range) for field-size independence
interface RelativePosition {
  relX: number;  // 0 = left edge, 1 = right edge
  relY: number;  // 0 = top edge, 1 = bottom edge
}

// Convert touch/click event to relative position
function getRelativePosition(
  event: React.MouseEvent | React.TouchEvent,
  fieldRef: React.RefObject<HTMLDivElement>
): RelativePosition {
  const rect = fieldRef.current!.getBoundingClientRect();
  const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
  const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

  return {
    relX: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
    relY: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
  };
}
```

### Player Markers

```tsx
function PlayerMarker({ player, position, onMove }: PlayerMarkerProps) {
  return (
    <div
      className="absolute w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold cursor-move"
      style={{
        left: `${position.relX * 100}%`,
        top: `${position.relY * 100}%`,
        transform: 'translate(-50%, -50%)',
        backgroundColor: player.color || '#3b82f6',
        borderColor: player.isGoalie ? '#fbbf24' : '#ffffff',
      }}
    >
      {player.jerseyNumber || player.name.charAt(0)}
    </div>
  );
}
```

### Drawing Lines (SVG overlay)

```tsx
function DrawingOverlay({ drawings, isDrawing, currentLine }: DrawingOverlayProps) {
  // IMPORTANT: SVG polyline `points` attribute takes unitless numbers, NOT percentages.
  // Using `${x}%` in points produces invalid SVG. Instead, use a viewBox of "0 0 100 100"
  // with preserveAspectRatio="none" to map relative coordinates (0-1) to the full area.
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
    >
      {drawings.map((line, i) => (
        <polyline
          key={i}
          points={line.map(p => `${p.relX * 100},${p.relY * 100}`).join(' ')}
          fill="none"
          stroke="white"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {isDrawing && currentLine.length > 1 && (
        <polyline
          points={currentLine.map(p => `${p.relX * 100},${p.relY * 100}`).join(' ')}
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeDasharray="4"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
```

---

## 7. Loading and Error States

```tsx
// Consistent loading pattern across all routes
function LoadingState() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <p className="text-red-400 mb-4">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="bg-blue-600 text-white px-4 py-2 rounded">
          Try Again
        </button>
      )}
    </div>
  );
}

function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
      <p className="text-slate-400 mb-4">{message}</p>
      {action}
    </div>
  );
}
```

---

## Traps

1. **Relative coordinates for field diagrams**: Store positions as 0-1 range, not pixels. This makes the diagram work at any size and resolution.

2. **Touch events need `preventDefault()`**: Without it, mobile browsers scroll while the user tries to draw or drag.

3. **Bottom navigation height**: Account for the mobile nav bar height in page content padding (`pb-16`).

4. **Dynamic imports for heavy modals**: Large modals with rich editors should use `next/dynamic` to avoid loading them until needed.

5. **`usePathname()` for active nav state**: Don't use `window.location` — it doesn't work with Next.js client-side navigation.

---

## 8. Design System & Brand Identity

Both MatchOps apps (game tracker and practice planner) share a design system. This section documents the visual language so the new app maintains family consistency.

### MatchOps Family Brand

Both apps share:
- **Rajdhani font** (weights 400 and 600) loaded via `next/font/google`
- **Amber/indigo/slate color palette** on a dark theme
- **Full-screen modals** with noise texture and ambient lighting effects

### Color Palette

| Role | Tailwind Classes | Usage |
|------|-----------------|-------|
| **Primary (Amber)** | `amber-400` to `amber-600` | CTAs, brand text, selection rings, active states |
| **Secondary (Indigo)** | `indigo-500` to `indigo-600` | Buttons, focus rings, toggles, interactive elements |
| **Ambient (Sky Blue)** | `sky-400/10` to `sky-500/15` | Background glows, decorative ambient effects |
| **Base (Slate)** | `slate-600` through `slate-900` | Backgrounds, cards, inputs, borders |
| **Success** | `green-600` | Confirmation buttons, success indicators |
| **Danger** | `red-600` | Delete buttons, error states |
| **Warning** | `amber-500` | Caution indicators, warning badges |

### Typography

```tsx
// src/app/layout.tsx
import { Rajdhani } from 'next/font/google';

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-rajdhani',
});

// Apply via className:
<html className={`${rajdhani.variable}`}>
```

Utility classes:
- `font-sans` — body text (Rajdhani 400)
- `font-display` — headings and brand text (Rajdhani 600)

### Shared Component Library

These patterns are extracted from `modalStyles.tsx` and used across both apps.

**Button Variants**:

| Variant | Class Pattern | Usage |
|---------|-------------|-------|
| Primary | `bg-indigo-600 hover:bg-indigo-700 text-white` | Main actions |
| Secondary | `bg-slate-600 hover:bg-slate-500 text-white` | Secondary actions, cancel |
| Danger | `bg-red-600 hover:bg-red-700 text-white` | Destructive actions |
| Success | `bg-green-600 hover:bg-green-700 text-white` | Confirmation actions |

**Input Style**:

```
bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:ring-indigo-500 focus:border-indigo-500 rounded-md
```

**Card Style**:

```
bg-slate-900/70 border border-slate-700 rounded-lg p-4
```

**Modal System**: Full-screen overlay with layered visual effects:
1. Base: Dark overlay (`bg-black/50` or `bg-slate-900/95`)
2. Noise texture: Semi-transparent SVG pattern for visual depth
3. Ambient effects: 4-layer radial gradients using sky-blue and indigo for atmospheric lighting
4. Content: Modal panel with `bg-slate-800 rounded-lg`

**Toast Notifications**:
- Position: top-right (`fixed top-4 right-4`)
- Three types: success (green), error (red), info (blue)
- Auto-dismiss after 5 seconds
- Deduplication: skip if identical message + type is already visible
- Cap: Maximum 5 visible toasts (oldest removed when exceeded)

### Design Tokens

**Button Sizes**:
- Standard: `px-4 py-2 text-sm`
- Large: `px-6 py-3 text-base`
- Icon-only: `p-2` (square)

**Icon Sizes**:
- Navigation: `h-6 w-6`
- In-button: `h-4 w-4`
- Decorative: `h-8 w-8`

**Z-Index Hierarchy**:

| Layer | z-index | Usage |
|-------|---------|-------|
| Navigation toolbar | `z-40` | Bottom tab bar, top bar |
| Modals | `z-60` | Full-screen modals, dialogs |
| Toasts | `z-100` | Toast notifications (above everything) |

### App Name Styling

```tsx
<span className="text-amber-400 text-5xl font-bold tracking-tight">MatchOps</span>
```

The amber color on the app name is a brand signature used on splash screens and welcome pages.

### PWA Theme Colors

| Environment | Theme Color | Tailwind Equivalent |
|-------------|------------|---------------------|
| Production | `#1e293b` | `slate-800` |
| Development | `#4f46e5` | `indigo-600` |

These are set in the manifest and `<meta name="theme-color">` to color the browser chrome and Android status bar.
